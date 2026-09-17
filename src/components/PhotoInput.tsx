"use client";

import { useState } from "react";

export default function PhotoInput({
  currentPhotoUrl,
  label = "Photo (optional)",
  helperText,
}: {
  currentPhotoUrl?: string | null;
  label?: string;
  helperText?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  const displayUrl = previewUrl ?? currentPhotoUrl ?? null;

  return (
    <div className="flex items-center gap-4">
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt="Photo preview"
          className="w-16 h-16 rounded-full object-cover border border-slate-200"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
          No photo
        </div>
      )}
      <div className="flex-1">
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input
          name="photo"
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        {helperText && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
      </div>
    </div>
  );
}
