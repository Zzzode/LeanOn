package com.zzzode.leanon.container

import android.content.Context

/** A resolved Lynx bundle ready for the container to load. */
data class LoadedBundle(
  val route: String,
  val integrity: String?,
)

/**
 * Host-side loader for Lynx bundles. Lynx itself does not fetch resources.
 * Implementations resolve a route from the signed local cache first and fall
 * back to the network (see RFC 0007).
 */
interface BundleResourceProvider {
  fun load(route: String): LoadedBundle
}

/** Default provider; cache and verification are completed in RFC 0007. */
class DefaultBundleResourceProvider(
  @Suppress("unused") private val context: Context,
) : BundleResourceProvider {
  override fun load(route: String): LoadedBundle {
    TODO("wire signed local cache and network fetch (RFC 0007)")
  }
}
