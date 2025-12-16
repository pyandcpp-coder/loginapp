import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase;

export const initDB = async () => {
  try {
    db = await SQLite.openDatabaseAsync('auth.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY NOT NULL, 
        email TEXT NOT NULL UNIQUE, 
        password TEXT NOT NULL
      );
    `);
    return "Table created successfully";
  } catch (error) {
    throw error;
  }
};


export const registerUser = async (email: string, password: string) => {
  try {
    const result = await db.runAsync(
      "INSERT INTO users (email, password) VALUES (?, ?);",
      [email, password]
    );
    return result;
  } catch (error) {
    throw error;
  }
};

// 4. Helper to Find a User (Login)
export const loginUser = async (email: string, password: string) => {
  try {
    const result = await db.getFirstAsync(
      "SELECT * FROM users WHERE email = ? AND password = ?;",
      [email, password]
    );
    
    if (result) {
      return result; // User found!
    } else {
      throw new Error("User not found"); // Wrong email or password
    }
  } catch (error) {
    throw error;
  }
};
