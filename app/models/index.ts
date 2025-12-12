import { Realm, createRealmContext } from '@realm/react';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values'; 
export class Post extends Realm.Object<Post> {
  _id!: Realm.BSON.ObjectId;
  text!: string;
  timestamp!: Date;
  isSynced!: boolean;
  localUri?: string;
  remoteUrl?: string;

  static schema: Realm.ObjectSchema = {
    name: 'Post',
    properties: {
      _id: 'objectId',
      text: 'string',
      timestamp: 'date',
      isSynced: { type: 'bool', default: false },
      localUri: 'string?',
      remoteUrl:'string?',
    },
    primaryKey: '_id',
  };
}
async function getRealmKey(): Promise<ArrayBuffer> {
  const storedKey = await SecureStore.getItemAsync('realm_key');
  if (storedKey) {
    const match = storedKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
    if (match && match.length === 64) return new Uint8Array(match).buffer;
  }
  const key = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    key[i] = Math.floor(Math.random() * 256);
  }
  const hexKey = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync('realm_key', hexKey);
  return key.buffer;
}


export const { RealmProvider, useRealm, useQuery } = createRealmContext({
  schema: [Post],
  schemaVersion: 2,
});