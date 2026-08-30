export type LinkPreview = {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
};

const URL_REGEX = /(https?:\/\/[^\s<>()]+(?:\([^\s]*\)|[^\s<>()])*)/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];

  const matches = text.match(URL_REGEX) ?? [];
  const normalized = matches
    .map((match) => match.trim())
    .map((match) => match.replace(/[).,;!?]+$/, ""))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).toString();
  } catch {
    return rawUrl;
  }
}

function getMetaContent(html: string, propertyNames: string[]): string | undefined {
  for (const propertyName of propertyNames) {
    const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(regex);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

export function parseOpenGraphMetadata(html: string, url: string): LinkPreview | null {
  const title = getMetaContent(html, ["og:title", "twitter:title"]) || html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!title) {
    return null;
  }

  const description = getMetaContent(html, ["og:description", "twitter:description"]) || undefined;
  const image = getMetaContent(html, ["og:image", "twitter:image"]) || undefined;
  const siteName = getMetaContent(html, ["og:site_name"]) || undefined;

  return {
    url: normalizeUrl(url),
    title: title.trim(),
    description: description?.trim(),
    image: image?.trim(),
    siteName: siteName?.trim(),
  };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const cleanUrl = normalizeUrl(url);
    const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: {
        title?: string;
        description?: string;
        image?: { url?: string } | string | null;
        url?: string;
        publisher?: { name?: string } | null;
      };
    };

    const data = payload.data;
    const imageUrl = typeof data?.image === "string" ? data.image : data?.image && typeof data.image === "object" ? data.image.url : undefined;
    const title = data?.title?.trim();

    if (!title) {
      return {
        url: cleanUrl,
        title: cleanUrl,
      };
    }

    return {
      url: normalizeUrl(data?.url || cleanUrl),
      title,
      description: data?.description?.trim(),
      image: imageUrl?.trim(),
      siteName: data?.publisher?.name?.trim() || undefined,
    };
  } catch {
    return null;
  }
}
