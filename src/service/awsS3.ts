import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const uploadFileToS3 = async (
  file: Express.Multer.File,
  bucket: string
) => {
  const fileKey = `uploads/${Date.now()}_${file.originalname}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read",
    Metadata: {
      originalName: file.originalname,
      uploadDate: new Date().toISOString(),
      fileSize: file.size.toString(),
    },
  });

  const result = await s3Client.send(command);

  return {
    Location: `https://${bucket}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${fileKey}`,
    Key: fileKey,
    ETag: result.ETag,
  };
};

export const uploadLargeFileToS3 = async (
  file: Express.Multer.File,
  bucket: string
) => {
  const fileKey = `uploads/large/${Date.now()}_${file.originalname}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
      Metadata: {
        originalName: file.originalname,
        uploadDate: new Date().toISOString(),
        fileSize: file.size.toString(),
      },
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  upload.on("httpUploadProgress", (progress) => {
    console.log(
      `Upload progress: ${Math.round(
        (progress.loaded! / progress.total!) * 100
      )}%`
    );
  });

  const result = await upload.done();
  return result;
};

export const uploadMultipleFilesToS3 = async (
  files: Express.Multer.File[],
  bucket: string
) => {
  if (!files || files.length === 0) {
    throw new Error("No files provided for upload");
  }

  const uploadPromises = files.map(async (file, index) => {
    try {
      const fileSizeInMB = file.size / (1024 * 1024);
      const isLargeFile = fileSizeInMB >= 100;

      let result;
      if (isLargeFile) {
        console.log(
          `Uploading large file ${index + 1}/${files.length}: ${
            file.originalname
          } (${fileSizeInMB.toFixed(2)}MB)`
        );
        result = await uploadLargeFileToS3(file, bucket);
      } else {
        console.log(
          `Uploading file ${index + 1}/${files.length}: ${
            file.originalname
          } (${fileSizeInMB.toFixed(2)}MB)`
        );
        result = await uploadFileToS3(file, bucket);
      }

      return {
        success: true,
        originalName: file.originalname,
        url: result.Location,
        key: result.Key,
        size: file.size,
        type: file.mimetype,
        uploadMethod: isLargeFile ? "multipart" : "standard",
        index: index,
      };
    } catch (error) {
      console.error(`Failed to upload file ${file.originalname}:`, error);
      return {
        success: false,
        originalName: file.originalname,
        error: error instanceof Error ? error.message : "Unknown error",
        size: file.size,
        type: file.mimetype,
        index: index,
      };
    }
  });

  const results = await Promise.allSettled(uploadPromises);

  const uploadResults = results.map((result, index) => {
    const file = files[index];
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        success: false,
        originalName: file?.originalname || `file_${index}`,
        error: result.reason?.message || "Upload failed",
        size: file?.size || 0,
        type: file?.mimetype || "unknown",
        index: index,
      };
    }
  });

  const successfulUploads = uploadResults.filter((result) => result.success);
  const failedUploads = uploadResults.filter((result) => !result.success);

  return {
    totalFiles: files.length,
    successful: successfulUploads.length,
    failed: failedUploads.length,
    results: uploadResults,
    successfulUploads,
    failedUploads,
  };
};

export const generatePresignedUploadUrl = async (
  bucket: string,
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
) => {
  const fileKey = `uploads/${Date.now()}_${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileKey,
    ContentType: contentType,
    ACL: "public-read",
    Metadata: {
      originalName: fileName,
      uploadDate: new Date().toISOString(),
    },
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  return {
    presignedUrl,
    key: fileKey,
    bucket,
    expiresIn,
    publicUrl: `https://${bucket}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${fileKey}`,
  };
};

export const generatePresignedDownloadUrl = async (
  bucket: string,
  key: string,
  expiresIn: number = 3600
) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  return {
    presignedUrl,
    key,
    bucket,
    expiresIn,
    publicUrl: `https://${bucket}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${key}`,
  };
};

export const generateMultiplePresignedUploadUrls = async (
  bucket: string,
  files: Array<{ fileName: string; contentType: string }>,
  expiresIn: number = 3600
) => {
  const presignedUrls = await Promise.all(
    files.map(async (file, index) => {
      try {
        const result = await generatePresignedUploadUrl(
          bucket,
          file.fileName,
          file.contentType,
          expiresIn
        );
        return {
          success: true,
          index,
          fileName: file.fileName,
          ...result,
        };
      } catch (error) {
        return {
          success: false,
          index,
          fileName: file.fileName,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    })
  );

  const successful = presignedUrls.filter((result) => result.success);
  const failed = presignedUrls.filter((result) => !result.success);

  return {
    totalFiles: files.length,
    successful: successful.length,
    failed: failed.length,
    results: presignedUrls,
    successfulUrls: successful,
    failedUrls: failed,
  };
};

export const getFileMetadata = async (bucket: string, key: string) => {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const result = await s3Client.send(command);

  return {
    key,
    size: result.ContentLength,
    contentType: result.ContentType,
    lastModified: result.LastModified,
    metadata: result.Metadata,
    etag: result.ETag,
    publicUrl: `https://${bucket}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${key}`,
  };
};

export const downloadFileFromS3 = async (bucket: string, key: string) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const result = await s3Client.send(command);

  return {
    body: result.Body,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
    lastModified: result.LastModified,
    metadata: result.Metadata,
    key,
  };
};

export const listFiles = async (
  bucket: string,
  prefix?: string,
  maxKeys: number = 1000
) => {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const result = await s3Client.send(command);

  const files =
    result.Contents?.map((item) => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      etag: item.ETag,
      publicUrl: `https://${bucket}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${item.Key}`,
    })) || [];

  return {
    files,
    totalCount: result.KeyCount || 0,
    isTruncated: result.IsTruncated,
    nextContinuationToken: result.NextContinuationToken,
    prefix,
  };
};

export const deleteFolderByPrefix = async (bucket: string, prefix: string) => {
  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const listResult = await s3Client.send(listCommand);

  if (!listResult.Contents || listResult.Contents.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: "No files found with the specified prefix",
    };
  }

  const objectsToDelete = listResult.Contents.map((item) => ({
    Key: item.Key!,
  }));

  const deleteCommand = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: objectsToDelete,
      Quiet: false,
    },
  });

  const deleteResult = await s3Client.send(deleteCommand);

  return {
    success: true,
    deletedCount: deleteResult.Deleted?.length || 0,
    deleted: deleteResult.Deleted,
    errors: deleteResult.Errors,
    prefix,
  };
};

export const deleteFileFromS3 = async (bucket: string, key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);

  return {
    success: true,
    deletedKey: key,
    message: "File deleted successfully",
  };
};

export const deleteMultipleFiles = async (bucket: string, keys: string[]) => {
  if (keys.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: "No files to delete",
    };
  }

  const objectsToDelete = keys.map((key) => ({ Key: key }));

  const command = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: objectsToDelete,
      Quiet: false,
    },
  });

  const result = await s3Client.send(command);

  return {
    success: true,
    deletedCount: result.Deleted?.length || 0,
    deleted: result.Deleted,
    errors: result.Errors,
  };
};

export const getFileWithSignedUrl = async (
  bucket: string,
  key: string,
  expiresIn: number = 3600
) => {
  try {
    const metadata = await getFileMetadata(bucket, key);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return {
      success: true,
      signedUrl,
      metadata,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  } catch (error) {
    throw new Error(`File not found or access denied: ${key}`);
  }
};
