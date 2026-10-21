export interface Ciphertext {
    algorithm: 'AES-256-GCM';
    nonce: string;
    ciphertext: string;
    tag: string;
}
export interface Group {
    id: string;
    kind: 'vault' | 'family';
    members: string[];
    epoch: number;
    grants: Record<string, Record<string, string[]>>;
}
export interface Invite {
    id: string;
    kind: 'family' | 'device';
    creatorId: string;
    creatorDeviceId: string;
    recipientId: string | null;
    recipientDeviceId: string | null;
    status: 'open' | 'pending' | 'accepted' | 'cancelled';
    expiresAt: number;
    wrappedKey: Ciphertext;
    groupId: string;
}
export interface Change {
    id: string;
    recordId: string;
    category: string;
    kind: 'record' | 'encouragement';
    updatedAt: number;
    deleted: boolean;
    payload: Ciphertext;
}
export interface StoredChange extends Change {
    ownerId: string;
    deviceId: string;
    sequence: number;
}
export interface Receipt {
    id: string;
    recipientId: string;
    acknowledgedAt: number;
}
export interface AccountDeletionReceipt {
    version: 1;
    operationId: string;
    accountId: string;
    status: 'deleted';
    deletedAt: number;
}
export interface AccountDeletionAcknowledgement {
    version: 1;
    operationId: string;
    status: 'acknowledged';
}
export interface SessionDto {
    accountId: string;
    deviceId: string;
    token: string;
    expiresAt: number;
    vaultId: string;
    deviceAuthorized: boolean;
}
export interface SyncResponse {
    epoch: number;
    cursor: number;
    group: Group;
    changes: StoredChange[];
    receipts: Receipt[];
}
