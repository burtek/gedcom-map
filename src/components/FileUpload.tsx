"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./FileUpload.module.css";

interface FileUploadProps {
  onFile: (text: string, fileName: string) => void;
  disabled?: boolean;
}

export default function FileUpload({ onFile, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result;
        if (typeof text === "string") {
          onFile(text, file.name);
        }
      };
      reader.readAsText(file, "utf-8");
    },
    [onFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be re-loaded
      e.target.value = "";
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  return (
    <div
      className={`${styles.dropzone} ${dragging ? styles.dragging : ""} ${disabled ? styles.disabled : ""}`}
      onDrop={disabled ? undefined : handleDrop}
      onDragOver={disabled ? undefined : handleDragOver}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label="Upload GEDCOM file"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".ged,.gedcom"
        className={styles.hiddenInput}
        onChange={handleChange}
        disabled={disabled}
        aria-hidden
      />
      <span className={styles.icon}>📂</span>
      <span className={styles.label}>
        {dragging ? "Drop your .ged file here" : "Click or drag a .ged file to load"}
      </span>
    </div>
  );
}
