import { extend } from "zod/mini";
import { dbRepository } from "./db.repositories.js";
import { IUser } from "../model/user.model.js";
import { HydratedDocument, Model } from "mongoose";
import { appError } from "../../utils/classError.js";

export class userRepository extends dbRepository<IUser>{
    constructor(protected readonly model:Model<IUser>){
        super(model)
    }

    async createUser(data:Partial<IUser>):Promise<HydratedDocument<IUser>>{
        const user:HydratedDocument<IUser>= await this.model.create(data)
    
          if (!user) {
            throw new appError("failed to create",401);
            
          }

          return user
    
}
}