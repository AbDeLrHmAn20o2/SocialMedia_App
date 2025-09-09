import { HydratedDocument, Model, ProjectionType, RootFilterQuery } from "mongoose";
import { appError } from "../../utils/classError.js";

export abstract class dbRepository<TDocument>{

    constructor(protected readonly model:Model<TDocument>){}



    async create(data:Partial<TDocument>):Promise<HydratedDocument<TDocument>>{
        return this.model.create(data)
    }
    async findOne(filter:RootFilterQuery<TDocument>,select?:ProjectionType<TDocument>):Promise<HydratedDocument<TDocument>|null>{
        return this.model.findOne(filter)
    }




}