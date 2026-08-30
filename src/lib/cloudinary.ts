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
): Promise<{ url: string; type: "image" | "video" | "file"; fileName: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Le fichier dépasse la limite de 10 Mo.");
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
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
      onProgress(progress);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText) as { secure_url?: string };
          if (!payload.secure_url) {
            reject(new Error("Réponse Cloudinary incomplète."));
            return;
          }

          const type = file.type.startsWith("video/")
            ? "video"
            : file.type.startsWith("image/")
              ? "image"
              : "file";

          resolve({
            url: payload.secure_url,
            type,
            fileName: file.name,
          });
        } catch (error) {
          reject(new Error("Le téléchargement Cloudinary a échoué."));
        }
        return;
      }

      reject(new Error("L’upload Cloudinary a été refusé."));
    };

    xhr.onerror = () => reject(new Error("Erreur réseau pendant l’upload Cloudinary."));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/upload`);
    xhr.send(formData);
  });
}
