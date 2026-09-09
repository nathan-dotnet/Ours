import { resetDatabaseHandleForTests } from '../../database/db';
import { syncQueueRepository } from '../../sync/syncQueue';
import { vaultRepository } from '../vaultRepository';

const COUPLE_ID = 'couple-1';
const USER_ID = 'user-alice';

function input(overrides: Partial<Parameters<typeof vaultRepository.createLocally>[1]> = {}) {
  return {
    title: 'Netflix',
    username: 'alice@example.com',
    password: 'correct horse battery staple',
    websiteUrl: 'https://netflix.com',
    category: 'Streaming',
    notes: 'Family account',
    ...overrides,
  };
}

describe('vaultRepository', () => {
  beforeEach(() => {
    resetDatabaseHandleForTests();
  });

  it('createLocally writes SQLite immediately and queues a CREATE sync op — but never stores the plaintext password locally', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);

    const stored = await vaultRepository.getById(item.id);
    expect(stored).toMatchObject({ title: 'Netflix', username: 'alice@example.com', category: 'Streaming', couple_id: COUPLE_ID, version: 1 });
    // The only place a password ever exists locally is the outbox row headed to the server —
    // never the persisted vault_items record itself.
    expect(stored?.encrypted_password).toBeNull();
    expect(stored?.nonce).toBeNull();
    expect(stored?.auth_tag).toBeNull();

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity_type: 'vault_item', entity_id: item.id, operation: 'CREATE' });
    expect(JSON.parse(pending[0].payload)).toMatchObject({ title: 'Netflix', password: 'correct horse battery staple' });
  });

  it('the returned in-memory item from createLocally also carries no encrypted fields yet', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);
    expect(item.encrypted_password).toBeNull();
  });

  it('getAllForCouple returns only that couple\'s non-deleted items, alphabetized', async () => {
    await vaultRepository.createLocally(COUPLE_ID, input({ title: 'WiFi' }), USER_ID);
    await vaultRepository.createLocally(COUPLE_ID, input({ title: 'Gmail' }), USER_ID);
    await vaultRepository.createLocally('some-other-couple', input({ title: 'Not mine' }), USER_ID);

    const items = await vaultRepository.getAllForCouple(COUPLE_ID);

    expect(items.map((i) => i.title)).toEqual(['Gmail', 'WiFi']);
  });

  it('updateLocally changes editable fields and, when a new password is given, queues it — but still never writes it into the row', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await vaultRepository.updateLocally(item, input({ title: 'Netflix Family', password: 'new-password' }), USER_ID);

    const updated = await vaultRepository.getById(item.id);
    expect(updated).toMatchObject({ title: 'Netflix Family' });
    expect(updated?.encrypted_password).toBeNull(); // still null — only applyRemoteChange ever sets it

    const pending = await syncQueueRepository.getPending();
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0].payload)).toMatchObject({ password: 'new-password' });
  });

  it('updateLocally without a password omits it from the payload — the server knows to leave the encrypted value alone', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await vaultRepository.updateLocally(item, input({ title: 'Netflix Family', password: null }), USER_ID);

    const pending = await syncQueueRepository.getPending();
    expect(JSON.parse(pending[0].payload).password).toBeNull();
  });

  it('deleteLocally removes the row immediately and queues a DELETE sync op', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);
    const [createRow] = await syncQueueRepository.getPending();
    await syncQueueRepository.markSynced(createRow.id);

    await vaultRepository.deleteLocally(item);

    expect(await vaultRepository.getById(item.id)).toBeNull();
    const pending = await syncQueueRepository.getPending();
    expect(pending[0].operation).toBe('DELETE');
  });

  it('applyRemoteChange upserts an item this device has never seen (the partner created it), storing the server\'s encrypted representation', async () => {
    await vaultRepository.applyRemoteChange(
      COUPLE_ID,
      'partner-item-1',
      {
        title: 'Gmail',
        username: 'bob@example.com',
        websiteUrl: null,
        category: 'Email',
        notes: null,
        encryptedPassword: 'YmFzZTY0LWNpcGhlcnRleHQ=',
        nonce: 'YmFzZTY0LW5vbmNl',
        authTag: 'YmFzZTY0LXRhZw==',
        keyVersion: 1,
        createdByUserId: 'user-bob',
      },
      new Date().toISOString(),
      'user-bob',
      1,
    );

    const stored = await vaultRepository.getById('partner-item-1');
    expect(stored).toMatchObject({
      title: 'Gmail',
      created_by_user_id: 'user-bob',
      encrypted_password: 'YmFzZTY0LWNpcGhlcnRleHQ=',
      nonce: 'YmFzZTY0LW5vbmNl',
      auth_tag: 'YmFzZTY0LXRhZw==',
      key_version: 1,
    });
  });

  it('applyRemoteChange with a null payload deletes the local row (a pulled tombstone)', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await vaultRepository.applyRemoteChange(COUPLE_ID, item.id, null, new Date().toISOString(), 'user-bob', 2);

    expect(await vaultRepository.getById(item.id)).toBeNull();
  });

  it('applyRemoteChange updates an existing local row (e.g. after this device\'s own create round-trips back) without disturbing created_by_user_id', async () => {
    const item = await vaultRepository.createLocally(COUPLE_ID, input(), USER_ID);

    await vaultRepository.applyRemoteChange(
      COUPLE_ID,
      item.id,
      {
        title: 'Netflix',
        username: 'alice@example.com',
        websiteUrl: 'https://netflix.com',
        category: 'Streaming',
        notes: 'Family account',
        encryptedPassword: 'Y2lwaGVydGV4dA==',
        nonce: 'bm9uY2U=',
        authTag: 'dGFn',
        keyVersion: 1,
      },
      new Date().toISOString(),
      USER_ID,
      2,
    );

    const stored = await vaultRepository.getById(item.id);
    expect(stored).toMatchObject({ created_by_user_id: USER_ID, version: 2, encrypted_password: 'Y2lwaGVydGV4dA==' });
  });
});
