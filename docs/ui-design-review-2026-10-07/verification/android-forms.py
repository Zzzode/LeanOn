import subprocess,json,time,pathlib,uuid,hashlib,re
root=pathlib.Path(__file__).resolve().parent
adb='/Users/bytedance/Library/Android/sdk/platform-tools/adb'
base=[adb,'-s','emulator-5582']
package='com.zzzode.leanon.uiqa'
def run(*args,input=None):return subprocess.check_output(base+list(args),input=input)
def put(path,data):
 run('shell','run-as',package,'sh','-c',"'cat > "+path+"'",input=data)
run('shell','run-as',package,'mkdir','-p','cache/daily-ui')
put('cache/daily-ui/records.json',pathlib.Path('/tmp/leanon-review-20261007-main.json').read_bytes())
log=open(root/'android-session.log','wb')
p=subprocess.Popen(base+['shell','am','instrument','-w','-e','scenario','daily-interactive','-e','reset','false',package+'.test/com.zzzode.leanon.qa.ParityInstrumentation'],stdout=log,stderr=subprocess.STDOUT)
time.sleep(8)
results=[]
def command(name,action,**kwargs):
 if action=='click' and results:
  tree=json.loads((pathlib.Path('docs/ui-design-review-2026-10-07/accessibility')/(results[-1]['outputName']+'.json')).read_text())
  node=next((n for n in tree['hierarchy'] if n.get('description')==kwargs['label'] or n.get('text')==kwargs['label']),None)
  if node:
   x1,y1,x2,y2=map(int,re.findall(r'-?\d+',node['bounds']));kwargs={'x':(x1+x2)/2,'y':(y1+y2)/2};action='tap'
  elif kwargs['label'] in ['Log weight','Log food','Log exercise']:
   kwargs={'x':{'Log food':210,'Log weight':540,'Log exercise':870}[kwargs['label']],'y':620};action='tap'
 native_name=name+'-'+uuid.uuid4().hex[:6];c={'id':native_name,'action':action,**kwargs};put('cache/daily-ui/command.json',json.dumps(c).encode())
 for _ in range(150):
  try:
   image=run('exec-out','run-as',package,'cat','cache/daily-ui/'+native_name+'.png')
   if image.startswith(b'\x89PNG'):
    tree=run('exec-out','run-as',package,'cat','cache/daily-ui/'+native_name+'.json');json.loads(tree)
    (pathlib.Path('docs/ui-design-review-2026-10-07/screens')/(name+'.png')).write_bytes(image)
    tree=run('exec-out','run-as',package,'cat','cache/daily-ui/'+native_name+'.json')
    (pathlib.Path('docs/ui-design-review-2026-10-07/accessibility')/(name+'.json')).write_bytes(tree)
    c['outputName']=name;results.append(c);print(name,flush=True);return
  except (subprocess.CalledProcessError,json.JSONDecodeError):pass
  time.sleep(.2)
 raise RuntimeError(name+' timed out')

command('android-en-form-launch','launch',route='today',appearance='light',now='2026-10-07T12:00:00Z',settleMs=3000)
command('android-en-weight-new','tap',x=540,y=620,settleMs=1500)
command('android-en-weight-zero','text',label='Weight',text='0')
command('android-en-weight-invalid','click',label='Save')
command('android-en-weight-cancel','click',label='Cancel')
command('android-en-food-search','tap',x=210,y=620,settleMs=1500)
command('android-en-food-query','text',label='Search foods',text='rice')
command('android-en-food-results','blur')
command('android-en-food-portion','click',label='White rice, cooked')
command('android-en-food-cancel','click',label='Cancel')
put('cache/daily-ui/command.json',json.dumps({'id':'review-finish','action':'finish'}).encode())
p.wait(timeout=15)
report=json.loads(run('exec-out','run-as',package,'cat','cache/daily-ui/session-report.json'))
(root/'android-session-report.json').write_text(json.dumps(report,indent=2))
print('source stores unchanged:',report.get('beforeRecordsSha256')==report.get('afterRecordsSha256'),'session success:',report.get('success'),flush=True)
