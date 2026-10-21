import Foundation
import UserNotifications

protocol ReminderNotificationClient {
  func permission(_ completion: @escaping (Bool) -> Void)
  func requestPermission(_ completion: @escaping (Bool, Error?) -> Void)
  func pending(_ completion: @escaping ([UNNotificationRequest]) -> Void)
  func remove(_ identifiers: [String])
  func add(_ request: UNNotificationRequest, completion: @escaping (Error?) -> Void)
}

final class SystemReminderNotificationClient: ReminderNotificationClient {
  private let center = UNUserNotificationCenter.current()
  func permission(_ completion: @escaping (Bool) -> Void) {
    center.getNotificationSettings { settings in
      completion(settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral)
    }
  }
  func requestPermission(_ completion: @escaping (Bool, Error?) -> Void) {
    center.requestAuthorization(options: [.alert, .sound], completionHandler: completion)
  }
  func pending(_ completion: @escaping ([UNNotificationRequest]) -> Void) { center.getPendingNotificationRequests(completionHandler: completion) }
  func remove(_ identifiers: [String]) { center.removePendingNotificationRequests(withIdentifiers: identifiers) }
  func add(_ request: UNNotificationRequest, completion: @escaping (Error?) -> Void) { center.add(request, withCompletionHandler: completion) }
}

final class ReminderManager {
  private let store: ReminderSettingsStore
  private let client: ReminderNotificationClient
  private let records: () throws -> NSDictionary
  private let clock: () -> Date
  private let calendar: () -> Calendar
  private let locale: () -> String
  private let prefix: String
  private let queue = DispatchQueue(label: "com.zzzode.leanon.reminders")
  private var updating = false
  private var requestingPermission = false
  private var refreshPending = false

  init(store: ReminderSettingsStore, client: ReminderNotificationClient = SystemReminderNotificationClient(),
       records: @escaping () throws -> NSDictionary, clock: @escaping () -> Date = Date.init,
       calendar: @escaping () -> Calendar = { .current }, locale: @escaping () -> String = { AppLocale.current },
       prefix: String = ReminderPlanner.prefix) {
    self.store = store; self.client = client; self.records = records
    self.clock = clock; self.calendar = calendar; self.locale = locale; self.prefix = prefix
  }

  func getSettings() throws -> NSDictionary { ["settings": try store.load().dictionary] }

  func requestPermission(completion: @escaping (Result<NSDictionary, Error>) -> Void) {
    queue.async {
      guard !self.requestingPermission else { completion(.failure(ReminderFailure.busy)); return }
      self.requestingPermission = true
      self.client.requestPermission { granted, error in
        self.queue.async {
          self.requestingPermission = false
          if let error = error { completion(.failure(error)) }
          else { completion(.success(["granted": granted])) }
        }
      }
    }
  }

  func update(_ settings: NativeReminderSettings, completion: @escaping (Result<NSDictionary, Error>) -> Void) {
    queue.async {
      guard !self.updating else { completion(.failure(ReminderFailure.busy)); return }
      self.updating = true
      self.client.permission { granted in
        self.queue.async {
          guard granted || (!settings.weight.enabled && !settings.meals.enabled) else {
            self.finish(.failure(ReminderFailure.permissionDenied), completion); return
          }
          do {
            _ = try self.store.load()
            let requests = self.requests(settings, records: try self.records())
            self.replace(requests) { result in
              self.queue.async {
                switch result {
                case .failure(let error): self.finish(.failure(error), completion)
                case .success(let oldRequests):
                  do {
                    try self.store.save(settings)
                    self.finish(.success(["success": true, "settings": settings.dictionary]), completion)
                  } catch {
                    self.client.remove(requests.map(\.identifier))
                    self.addSequential(oldRequests, index: 0) { _ in
                      self.queue.async { self.finish(.failure(error), completion) }
                    }
                  }
                }
              }
            }
          } catch { self.finish(.failure(error), completion) }
        }
      }
    }
  }

  func refresh() {
    queue.async {
      guard !self.updating else { self.refreshPending = true; return }
      self.updating = true
      self.client.permission { granted in
        self.queue.async {
          do {
            let settings = try self.store.load()
            let requests = granted ? self.requests(settings, records: try self.records()) : []
            self.replace(requests) { _ in self.queue.async { self.completeOperation() } }
          } catch { self.completeOperation() }
        }
      }
    }
  }

  private func requests(_ settings: NativeReminderSettings, records: NSDictionary) -> [UNNotificationRequest] {
    let calendar = calendar()
    return ReminderPlanner.plan(settings: settings, records: records, now: clock(), calendar: calendar).map { occurrence in
      let content = UNMutableNotificationContent()
      let bundle = Bundle.main.path(forResource: locale().hasPrefix("zh") ? "zh-Hans" : "en", ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
      content.title = bundle.localizedString(forKey: occurrence.kind + ".title", value: nil, table: "Reminders")
      content.body = bundle.localizedString(forKey: occurrence.kind + ".body", value: nil, table: "Reminders")
      content.sound = .default
      var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: occurrence.date)
      components.calendar = calendar; components.timeZone = calendar.timeZone
      let id = prefix + occurrence.identifier.dropFirst(ReminderPlanner.prefix.count)
      return UNNotificationRequest(identifier: id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false))
    }
  }

  private func replace(_ requests: [UNNotificationRequest], completion: @escaping (Result<[UNNotificationRequest], Error>) -> Void) {
    client.pending { pending in
      self.queue.async {
        let old = pending.filter { $0.identifier.hasPrefix(self.prefix) }
        self.client.remove(old.map(\.identifier))
        self.addSequential(requests, index: 0) { error in
          self.queue.async {
            if let error = error {
              self.client.remove(requests.map(\.identifier))
              self.addSequential(old, index: 0) { _ in completion(.failure(error)) }
            } else { completion(.success(old)) }
          }
        }
      }
    }
  }

  private func addSequential(_ requests: [UNNotificationRequest], index: Int, completion: @escaping (Error?) -> Void) {
    guard index < requests.count else { completion(nil); return }
    client.add(requests[index]) { error in
      if let error = error { completion(error) }
      else { self.addSequential(requests, index: index + 1, completion: completion) }
    }
  }

  private func completeOperation() {
    updating = false
    if refreshPending { refreshPending = false; refresh() }
  }
  private func finish(_ result: Result<NSDictionary, Error>, _ completion: (Result<NSDictionary, Error>) -> Void) {
    completeOperation(); completion(result)
  }
}
