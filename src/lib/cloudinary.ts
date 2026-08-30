export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  );
}

export async function uploadToCloudinary(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ url: string; type: "image" | "video" | "audio" | "file"; fileName: string }> {
  console.log("[Cloudinary] uploadToCloudinary start", {
    fileName: file.name,
    type: file.type,
    size: file.size,
  });

  if (file.size > MAX_UPLOAD_BYTES) {
    console.error("[Cloudinary] file too large", { size: file.size, max: MAX_UPLOAD_BYTES });
    throw new Error("Le fichier dépasse la limite de 10 Mo.");
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  console.log("[Cloudinary] env state", {
    cloudName: cloudName ? "set" : "missing",
    uploadPreset: uploadPreset ? "set" : "missing",
  });

  if (!cloudName || !uploadPreset) {
    console.error("[Cloudinary] configuration missing", {
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: cloudName ?? null,
      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: uploadPreset ?? null,
    });
    throw new Error("Cloudinary n’est pas configuré. Ajoutez NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME et NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "messagerie-prive");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      console.log("[Cloudinary] upload progress", { loaded: event.loaded, total: event.total, progress });
      onProgress(progress);
    };

    xhr.onload = () => {
      console.log("[Cloudinary] response status", { status: xhr.status, response: xhr.responseText.slice(0, 240) });
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText) as { secure_url?: string };
          console.log("[Cloudinary] parsed payload", payload);
          if (!payload.secure_url) {
            console.error("[Cloudinary] invalid response payload", payload);
            reject(new Error("Réponse Cloudinary incomplète."));
            return;
          }

          const type = file.type.startsWith("audio/")
            ? "audio"
            : file.type.startsWith("video/")
              ? "video"
              : file.type.startsWith("image/")
                ? "image"
                : "file";

          console.log("[Cloudinary] resolved upload", { url: payload.secure_url, type, fileName: file.name });
          resolve({
            url: payload.secure_url,
            type,
            fileName: file.name,
          });
        } catch (error) {
          console.error("[Cloudinary] JSON parse failed", error, xhr.responseText.slice(0, 400));
          reject(new Error("Le téléchargement Cloudinary a échoué."));
        }
        return;
      }

      console.error("[Cloudinary] upload rejected", { status: xhr.status, response: xhr.responseText.slice(0, 400) });
      reject(new Error("L’upload Cloudinary a été refusé."));
    };

    xhr.onerror = () => {
      console.error("[Cloudinary] network error during upload");
      reject(new Error("Erreur réseau pendant l’upload Cloudinary."));
    };
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/upload`);
    console.log("[Cloudinary] sending request", { cloudName, uploadPreset, fileName: file.name });
    xhr.send(formData);
  });
}
