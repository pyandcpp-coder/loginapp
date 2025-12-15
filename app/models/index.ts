import { Realm, createRealmContext } from '@realm/react';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values'; 
import { StyleBuilderConfig } from 'react-native-reanimated/lib/typescript/css/native';
export class Post extends Realm.Object<Post> {
  _id!: Realm.BSON.ObjectId;
  text!: string;
  timestamp!: Date;
  isSynced!: boolean;
  localUri?: string;
  remoteUrl?: string;
  userEmail!:string;

  static schema: Realm.ObjectSchema = {
    name: 'Post',
    properties: {
      _id: 'objectId',
      text: 'string',
      timestamp: 'date',
      isSynced: { type: 'bool', default: false },
      localUri: 'string?',
      remoteUrl:'string?',
      userEmail:{type:'string',default:'anon'}
    },
    primaryKey: '_id',
  };
}
export class Like extends Realm.Object<Like> {
  _id!: Realm.BSON.ObjectId;
  postId!: string;
  userEmail!: string;
  isSynced!: boolean;
  isDeleted!: boolean;

  static schema: Realm.ObjectSchema = {
    name: 'Like',
    properties: {
      _id: 'objectId',
      postId: 'string',
      userEmail: 'string',
      isSynced: { type: 'bool', default: false },
      isDeleted:{type:'bool',default:false},
    },
    primaryKey: '_id',
  };
}

export class Comment extends Realm.Object<Comment> {
  _id!: Realm.BSON.ObjectId;
  postId!: string;
  userEmail!: string;
  text!: string;
  timestamp!: Date;
  isSynced!: boolean;
  isDeleted!: boolean;


  static schema: Realm.ObjectSchema = {
    name: 'Comment',
    properties: {
      _id: 'objectId',
      postId: 'string',
      userEmail: 'string',
      text: 'string',
      timestamp: 'date',
      isSynced: { type: 'bool', default: false },
      isDeleted: {type: 'bool', default:false},
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
  schema: [Post,Like,Comment],
  schemaVersion: 5,
  onMigration: (oldRealm, newRealm) => {
    // Migration logic - this will be called when schema version changes
    console.log('Realm migration started...');
    // No data transformation needed, Realm will handle adding the new properties with their defaults
  },
});