"use client";

import dynamic from "next/dynamic";

// zxing is ~heavy and only needed when the camera actually opens, so load it on
// demand to keep it out of the POS / receiving bundles.
export const CameraScanner = dynamic(
  () => import("./CameraScanner").then((m) => m.CameraScanner),
  { ssr: false },
);
