import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Eat với người yêu ❤️",
    short_name: "Nam & Linh ❤️",
    description: "Một góc nhỏ của riêng tụi mình 💞",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f5",
    theme_color: "#fff9f5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
