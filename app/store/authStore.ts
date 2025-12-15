// import {create} from "zustand";
import {create} from "zustand";
import * as SecureStore from 'expo-secure-store';

//shape of the state
interface AuthState{
    user: {email: string} | null;
    isAuthenticated: boolean;
    isLoading : boolean;

    // action
    login:(email: string)=> Promise<void>;
    logout: ()=> Promise<void>;
    checkSession: ()=> Promise<void>;

}
// creating the store
export const useAuthStore = create<AuthState>((set)=>({
    user:null,
    isAuthenticated:false,
    isLoading:true, //start in loading state to check if any existing session
    
    login: async(email) => {
        await SecureStore.setItemAsync('user_session',email);
        set({user:{email},isAuthenticated:true});
    },

    logout:async ()=>{
        await SecureStore.deleteItemAsync('user_session');
        set({user:null,isAuthenticated:false});
    },

    checkSession: async()=>{
        // re-animation
        try{
            const savedEmail = await SecureStore.getItemAsync('user_session');
            if(savedEmail){
                set({user:{email:savedEmail},isAuthenticated:true});
            }
        } catch(e){
            console.error("Session check failed", e);
        }finally{
            set({isLoading:false});
        }
    },
}));

export default useAuthStore;