import { hrClient } from "./store";

export function safeLink(value: string): boolean {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export async function uploadHrFile(
  file: File,
  employeeId: string,
): Promise<string> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a PDF, JPG or PNG file.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Choose a file smaller than 2 MB.");
  const client = hrClient();
  if (client) {
    const path = `${employeeId}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
    const result = await client.storage
      .from("hr-documents")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (result.error) throw new Error(result.error.message);
    return `storage:${path}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export async function openHrFile(url: string, name: string): Promise<void> {
  if (url.startsWith("storage:")) {
    const client = hrClient();
    if (!client)
      throw new Error("This document requires the connected HR database.");
    const result = await client.storage
      .from("hr-documents")
      .download(url.slice(8));
    if (result.error) throw new Error(result.error.message);
    const local = URL.createObjectURL(result.data);
    const link = document.createElement("a");
    link.href = local;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(local), 1000);
  } else if (/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(url)) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } else if (safeLink(url)) window.open(url, "_blank", "noopener,noreferrer");
  else throw new Error("This document link is not supported.");
}
