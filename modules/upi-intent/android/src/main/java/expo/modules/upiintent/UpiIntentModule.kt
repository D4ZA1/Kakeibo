package expo.modules.upiintent

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.graphics.Color
import android.util.Base64
import androidx.core.content.FileProvider
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import java.io.File
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

private const val REQ_UPI = 4711
private const val REQ_QR = 4712
private const val REQ_FILE = 4713
private const val ICON_PX = 96

class UpiIntentModule : Module() {
  // One outstanding launch per kind; resolved in OnActivityResult when the user comes back.
  private val pending = mutableMapOf<Int, Promise>()

  /**
   * Starts `intent` from our activity, in our task, so finishing or backing out of the other app
   * returns straight to Kakeibo (no manual app switch) and we get a result callback.
   */
  private fun launch(code: Int, intent: Intent, promise: Promise) {
    val activity = appContext.currentActivity
      ?: return promise.reject("E_NO_ACTIVITY", "No activity", null)
    if (pending.containsKey(code)) return promise.reject("E_BUSY", "Already open", null)
    pending[code] = promise
    try {
      activity.startActivityForResult(intent, code)
    } catch (e: Exception) {
      pending.remove(code)
      promise.reject("E_NO_APP", "No app could handle this", e)
    }
  }

  private fun shareUri(file: File): Uri {
    val ctx = appContext.reactContext ?: throw IllegalStateException("No context")
    return FileProvider.getUriForFile(ctx, "${ctx.packageName}.upiintent.fileprovider", file)
  }

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    // The last shared QR (a payment link) and the last export shouldn't outlive the session.
    OnCreate {
      appContext.reactContext?.let { ctx ->
        File(ctx.cacheDir, "upi-qr").deleteRecursively()
        File(ctx.cacheDir, "exports").deleteRecursively()
      }
    }

    // Writes `text` to a cache file and opens the share sheet for it (CSV export).
    // Resolves when the share sheet (or the app picked from it) closes.
    AsyncFunction("shareFile") { text: String, fileName: String, mimeType: String, promise: Promise ->
      val ctx = appContext.reactContext ?: return@AsyncFunction promise.reject("E_NO_CONTEXT", "No context", null)
      val dir = File(ctx.cacheDir, "exports").apply { mkdirs() }
      val file = File(dir, fileName.replace(Regex("[^A-Za-z0-9._-]"), "_"))
      file.writeText(text)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, shareUri(file))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      launch(REQ_FILE, Intent.createChooser(send, null), promise)
    }

    Function("getInstalledApps") {
      val pm = appContext.reactContext?.packageManager ?: return@Function emptyList<Map<String, String>>()
      val probe = Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"))
      pm.queryIntentActivities(probe, 0)
        .distinctBy { it.activityInfo.packageName }
        .map {
          mapOf(
            "packageName" to it.activityInfo.packageName,
            "label" to it.loadLabel(pm).toString(),
            "iconBase64" to iconToBase64(it.loadIcon(pm)),
          )
        }
    }

    // Encodes `uri` as a QR image and shares it to the app, which reads it like a scanned QR.
    // UPI apps return no payment result this way; the promise resolves when the user is back.
    AsyncFunction("shareQrImage") { uri: String, packageName: String, promise: Promise ->
      val ctx = appContext.reactContext ?: return@AsyncFunction promise.reject("E_NO_CONTEXT", "No context", null)
      val dir = File(ctx.cacheDir, "upi-qr").apply { mkdirs() }
      val file = File(dir, "pay.png")
      file.outputStream().use { qrBitmap(uri).compress(Bitmap.CompressFormat.PNG, 100, it) }
      val share = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, shareUri(file))
        setPackage(packageName)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      launch(REQ_QR, share, promise)
    }

    AsyncFunction("pay") { uri: String, packageName: String, promise: Promise ->
      launch(REQ_UPI, Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName), promise)
    }

    OnActivityResult { _, payload ->
      val p = pending.remove(payload.requestCode) ?: return@OnActivityResult
      if (payload.requestCode != REQ_UPI) return@OnActivityResult p.resolve(null)
      val data = payload.data
      // Most apps put "txnId=..&Status=.." in the "response" extra; some only use separate extras.
      @Suppress("DEPRECATION")
      val raw = data?.getStringExtra("response")
        ?: data?.extras?.keySet()?.takeIf { it.isNotEmpty() }?.joinToString("&") { k -> "$k=${data.extras?.get(k)}" }
      p.resolve(
        mapOf(
          "raw" to raw,
          "resultCode" to payload.resultCode,
          "cancelled" to (payload.resultCode == Activity.RESULT_CANCELED && raw.isNullOrEmpty()),
        )
      )
    }
  }

  private fun qrBitmap(text: String, size: Int = 800): Bitmap {
    val hints = mapOf(EncodeHintType.MARGIN to 4, EncodeHintType.CHARACTER_SET to "UTF-8")
    val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
    val px = IntArray(size * size) { i -> if (m[i % size, i / size]) Color.BLACK else Color.WHITE }
    return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888)
  }

  private fun iconToBase64(d: Drawable): String {
    val bmp = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
    d.setBounds(0, 0, ICON_PX, ICON_PX)
    d.draw(Canvas(bmp))
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
