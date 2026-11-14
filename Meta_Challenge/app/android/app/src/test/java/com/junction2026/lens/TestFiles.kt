package com.junction2026.lens

import java.io.File

/** Finds a file under Meta_Challenge/app/ (e.g. "bridge/media/ball/manifest.json") from the test's working dir. */
internal fun appFile(rel: String): File {
    var d: File? = File(System.getProperty("user.dir")).absoluteFile
    while (d != null) {
        val f = File(d, rel)
        if (f.exists()) return f
        d = d.parentFile
    }
    error("$rel not found above ${System.getProperty("user.dir")}")
}
