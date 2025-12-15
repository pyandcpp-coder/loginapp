import { Realm, createRealmContext } from '@realm/react';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values'; 
import { StyleBuilderConfig } from 'react-native-reanimated/lib/typescript/css/native';


export class Post extends Realm.Object<Post> {
  _id!: Realm.BSON.ObjectId;
  text!: string;
  timestamp!: Date;
  isSynced!: boolean;
  deletedAt?: Date;
  localUri?: string;
  remoteUrl?: string;
  userEmail!:string;
  mediaType!: string;
  thumbnailUrl?: string;

  static schema: Realm.ObjectSchema = {
    name: 'Post',
    properties: {
      _id: 'objectId',
      text: 'string',
      timestamp: 'date',
      isSynced: { type: 'bool', default: false },
      deletedAt: 'date?',
      localUri: 'string?',
      remoteUrl:'string?',
      userEmail:{type:'string',default:'anon'},
      mediaType:{type:'string',default:'image'},
      thumbnailUrl:'string?',
    },
    primaryKey: '_id',
  };
}
export class Like extends Realm.Object<Like> {
  _id!: Realm.BSON.ObjectId;
  postId!: string;
  userEmail!: string;
  isSynced!: boolean;
  deletedAt?: Date;

  static schema: Realm.ObjectSchema = {
    name: 'Like',
    properties: {
      _id: 'objectId',
      postId: 'string',
      userEmail: 'string',
      isSynced: { type: 'bool', default: false },
      deletedAt: 'date?',
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
  deletedAt?: Date;

  static schema: Realm.ObjectSchema = {
    name: 'Comment',
    properties: {
      _id: 'objectId',
      postId: 'string',
      userEmail: 'string',
      text: 'string',
      timestamp: 'date',
      isSynced: { type: 'bool', default: false },
      deletedAt: 'date?',
    },
    primaryKey: '_id',
  };
}

export class SystemSettings extends Realm.Object<SystemSettings> {
  _id!: Realm.BSON.ObjectId;
  lastSyncTime!: Date;

  static schema: Realm.ObjectSchema = {
    name: 'SystemSettings',
    properties: {
      _id: 'objectId',
      lastSyncTime: { type: 'date', default: new Date(0) },
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
  schema: [Post, Like, Comment, SystemSettings],
  schemaVersion: 7,
  onMigration: (oldRealm, newRealm) => {
    // Migration logic - this will be called when schema version changes
    console.log('Realm migration started...');
    // Realm will handle adding new properties with their defaults
    
    // Initialize SystemSettings if it doesn't exist
    if (newRealm.objects('SystemSettings').length === 0) {
      newRealm.create('SystemSettings', {
        _id: new Realm.BSON.ObjectId(),
        lastSyncTime: new Date(0),
      });
    }
  },
});