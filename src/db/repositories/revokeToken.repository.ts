import { dbRepository } from "./db.repositories.js";
import { Model } from "mongoose";
import { IRevokeToken } from "../model/revokeToken.model.js";

export class RevokeTokenRepository extends dbRepository<IRevokeToken>{
    constructor(protected readonly model:Model<IRevokeToken>){
        super(model)
    }


}