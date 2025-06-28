import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Readable } from "stream";

interface AuthRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  // Check file type
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer: Buffer, folder: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    const stream = Readable.from(buffer);
    stream.pipe(uploadStream);
  });
};

// Upload single image for posts
export const uploadImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ msg: "No file uploaded" });
      return;
    }

    const file = req.file;

    // Upload to Cloudinary in user-specific folder
    const result = await uploadToCloudinary(
      file.buffer,
      `art-platform/posts/${userId}`
    );

    res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl: result.secure_url,
      imageKey: result.public_id, // Cloudinary uses public_id instead of key
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ msg: "Error uploading image" });
  }
};

// Delete image from Cloudinary
export const deleteImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { imageKey } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    // Check if user owns this image (public_id should contain userId)
    if (!imageKey.includes(userId)) {
      res
        .status(403)
        .json({ msg: "You don't have permission to delete this image" });
      return;
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(imageKey);

    res.status(200).json({
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ msg: "Error deleting image" });
  }
};

// Upload avatar
export const uploadAvatar = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ msg: "No file uploaded" });
      return;
    }

    const file = req.file;

    // Upload to Cloudinary avatars folder
    const result = await uploadToCloudinary(
      file.buffer,
      `art-platform/avatars`
    );

    // Update user avatar in database
    const { prisma } = await import("@/utils/prisma");

    // Get current user to delete old avatar if exists
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    // Delete old avatar from Cloudinary if exists
    if (currentUser?.avatar) {
      try {
        // Extract public_id from the old avatar URL
        const urlParts = currentUser.avatar.split("/");
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = `art-platform/avatars/${
          publicIdWithExt.split(".")[0]
        }`;
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.log("Could not delete old avatar:", deleteError);
      }
    }

    // Update user with new avatar
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: result.secure_url },
    });

    res.status(200).json({
      message: "Avatar uploaded successfully",
      avatar: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ msg: "Error uploading avatar" });
  }
};

// Get optimized image URL (Cloudinary feature)
export const getOptimizedImageUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { publicId, width, height, quality = "auto" } = req.query;

    if (!publicId) {
      res.status(400).json({ msg: "Public ID is required" });
      return;
    }

    const optimizedUrl = cloudinary.url(publicId as string, {
      width: width ? parseInt(width as string) : undefined,
      height: height ? parseInt(height as string) : undefined,
      crop: "fill",
      quality: quality as string,
      fetch_format: "auto",
    });

    res.status(200).json({
      optimizedUrl,
    });
  } catch (error) {
    console.error("Get optimized URL error:", error);
    res.status(500).json({ msg: "Error generating optimized URL" });
  }
};

// Middleware for single file upload
export const singleUpload = upload.single("image");

// Middleware for avatar upload
export const avatarUpload = upload.single("avatar");

// Middleware for multiple files upload (for future use)
export const multipleUpload = upload.array("images", 5);
