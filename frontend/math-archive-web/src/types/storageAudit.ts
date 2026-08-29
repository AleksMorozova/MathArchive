export type MissingStoredFile = {
  documentId: string;
  title: string;
  storedFileName: string;
};

export type OrphanedStoredFile = {
  storedFileName: string;
  fileSize: number;
  lastModifiedAt: string;
};

export type SizeMismatch = {
  documentId: string;
  title: string;
  storedFileName: string;
  expectedFileSize: number;
  actualFileSize: number;
};

export type StorageAuditReport = {
  checkedAt: string;
  referencedFileCount: number;
  storedFileCount: number;
  storedBytes: number;
  reclaimableBytes: number;
  missingFiles: MissingStoredFile[];
  orphanedFiles: OrphanedStoredFile[];
  sizeMismatches: SizeMismatch[];
  isHealthy: boolean;
};

export type StorageCleanupResult = {
  deletedFileCount: number;
  reclaimedBytes: number;
  currentState: StorageAuditReport;
};
