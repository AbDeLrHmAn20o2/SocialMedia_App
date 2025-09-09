import mongoose from "mongoose";

const connectionDB= async()=>{
    mongoose.connect(process.env.DB_URI as unknown as string)
    .then(()=>{
        console.log(`success to connect db ${process.env.DB_URI}......`);
        
    }).catch((error)=>{
        console.log("fail to connect db......",error);
        
    })
}
export default connectionDB