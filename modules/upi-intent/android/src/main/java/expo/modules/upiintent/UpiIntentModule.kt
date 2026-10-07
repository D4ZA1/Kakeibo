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
private const val ICON_PX = 96

class UpiIntentModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

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
    // No result comes back, so the caller always goes to Confirm afterwards.
    Function("shareQrImage") { uri: String, packageName: String ->
      val ctx = appContext.reactContext ?: return@Function false
      val dir = File(ctx.cacheDir, "upi-qr").apply { mkdirs() }
      val file = File(dir, "pay.png")
      file.outputStream().use { qrBitmap(uri).compress(Bitmap.CompressFormat.PNG, 100, it) }
      val content = FileProvider.getUriForFile(ctx, "${ctx.packageName}.upiintent.fileprovider", file)
      val share = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, content)
        setPackage(packageName)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        ctx.startActivity(share)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("pay") { uri: String, packageName: String, promise: Promise ->
      val activity = appContext.currentActivity
        ?: return@AsyncFunction promise.reject("E_NO_ACTIVITY", "No activity", null)
      if (pending != null) {
        return@AsyncFunction promise.reject("E_BUSY", "A payment is already in progress", null)
      }
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName)
      pending = promise
      try {
        activity.startActivityForResult(intent, REQ_UPI)
      } catch (e: Exception) {
        pending = null
        promise.reject("E_NO_UPI_APP", "No UPI app could handle this", e)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQ_UPI) return@OnActivityResult
      val p = pending ?: return@OnActivityResult
      pending = null
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
