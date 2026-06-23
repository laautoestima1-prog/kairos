/*
 * KAIROS · Cabina en la nube — configuración (MODO ARCHIVO LOCAL)
 * ─────────────────────────────────────────────────────────────────────────────
 * La cabina y el snapshot cifrado viven en el MISMO hosting.
 * No usa Google Drive, ni API key, ni compartir, ni Cloud Console.
 * Para refrescar los datos: vuelve a subir 'kairos-snapshot.enc' al hosting.
 *
 * (Para usar Google Drive en su lugar, borra 'localFile' y pon fileId + apiKey.)
 */
window.KAIROS_DRIVE = {
  localFile: "kairos-snapshot.enc",
};
