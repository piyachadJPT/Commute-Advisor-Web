import type { MetadataRoute } from "next";

// Web App Manifest (plan §11.11). Colours match the light theme-color in the root layout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Commute Advisor — รถยนต์หรือมอเตอร์ไซค์วันนี้",
    short_name: "Commute",
    description:
      "แนะนำว่าวันนี้ควรเอารถยนต์หรือมอเตอร์ไซค์ จากโอกาสฝนตลอดเส้นทางเดินทาง",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#eef4fa",
    background_color: "#eef4fa",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
