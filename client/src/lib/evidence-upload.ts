export async function runEvidenceUploads<T>(
  files: ArrayLike<T>,
  upload: (file: T) => Promise<unknown>,
  cleanup: () => void,
): Promise<void> {
  try {
    for (let index = 0; index < files.length; index += 1) {
      await upload(files[index]);
    }
  } finally {
    cleanup();
  }
}
