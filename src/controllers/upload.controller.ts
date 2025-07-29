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

// Helper function to upload buffer to Cloudinary with watermark
const uploadToCloudinary = (buffer: Buffer, folder: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
        transformation: [
          {
            overlay: "text:Arial_40:© AO Gallary",
            gravity: "center",
            x: 20,
            y: 20,
            color: "white",
            opacity: 70,
          },
        ],
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

const uploadAvatarToCloudinary = (buffer: Buffer): Promise<any> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ao_studio/avatars",
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
        transformation: [
          {
            width: 400,
            height: 400,
            crop: "fill",
            gravity: "face",
          },
          {
            rediius: "max",
          },
        ],
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

const extractPublicIdFromUrl = (url: string): string | null => {
  try {
    const match = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)$/i);
    return match ? match[1] : null;
  } catch (err) {
    console.log("Error extracting public ID:", err);
    return null;
  }
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
      `ao_studio/posts/${userId}`
    );

    res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl: result.secure_url,
      imageKey: result.public_id,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ msg: "Error uploading image" });
  }
};

export const getProtectedImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { publicId, postId } = req.params;
    const userId = req.user?.id;

    if (!publicId || !postId) {
      res.status(400).json({ msg: "Public ID and Post ID are required" });
      return;
    }

    const { prisma } = await import("../utils/prisma");

    // check ownership
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true } } },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    const isOwner = userId === post.author.id;

    let imageUrl: string;

    if (isOwner) {
      // clean image for owner
      imageUrl = cloudinary.url(publicId, {
        quality: "auto",
        fetch_format: "auto",
      });
    } else {
      imageUrl = cloudinary.url(publicId, {
        quality: "auto",
        fetch_format: "auto",
        transformation: [
          { blur: "500" },
          {
            overlay: "text:Arial_40:© AO STUDIO",
            gravity: "center",
            color: "white",
            opacity: 80,
          },
          {
            overlay: `text:Arial_30:${post.author}`,
            gravity: "north_west",
            x: 30,
            y: 30,
            color: "white",
            opacity: 60,
          },
        ],
      });
    }

    res.status(200).json({
      imageUrl,
      isOwner,
      isProtected: !isOwner,
    });
  } catch (err) {
    res.status(500).json({ msg: "Error getting protected image" });
  }
};

// clean image for purshased posts
export const getPurchasedImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { publicId, postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const { prisma } = await import("../utils/prisma");

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true } },
        bids: {
          where: { bidderId: userId },
          orderBy: { amount: "desc" },
          take: 1,
        },
      },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    const isOwner = userId === post.author.id;
    const hasPurchased = post.bids.length > 0;

    if (!isOwner && !hasPurchased) {
      res.status(403).json({ msg: "You don't have access to this image" });
      return;
    }

    const cleanImageUrl = cloudinary.url(publicId, {
      quality: "auto",
      fetch_format: "auto",
    });

    res.status(200).json({
      imageUrl: cleanImageUrl,
      downloadUrl: cleanImageUrl,
      msg: "Clean image access granted",
    });
  } catch (err) {
    res.status(500).json({ msg: "Error getting purchased image" });
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

    // Check if user owns this image
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

    if (file.size > 5 * 1024 * 1024) {
      res.status(400).json({ msg: "Avatar file size must be less than 5MB" });
      return;
    }

    // Upload to Cloudinary avatars folder
    const result = await uploadAvatarToCloudinary(file.buffer);

    // Update user avatar in database
    const { prisma } = await import("../utils/prisma");

    // Get current user to delete old avatar if exists
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    if (currentUser?.avatar) {
      try {
        const publicId = extractPublicIdFromUrl(currentUser.avatar);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (deleteError) {
        console.log("Could not delete old avatar:", deleteError);
      }
    }

    // Update user with new avatar
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar: result.secure_url },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
      },
    });

    res.status(200).json({
      message: "Avatar uploaded successfully",
      user: updatedUser,
      avatar: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ msg: "Error uploading avatar" });
  }
};

export const deleteAvatar = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const { prisma } = await import("../utils/prisma");

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true, firstName: true, lastName: true },
    });

    if (!currentUser?.avatar) {
      res.status(400).json({ msg: "No avatar to delete" });
      return;
    }

    // delete from cloudinary
    try {
      const publicId = extractPublicIdFromUrl(currentUser.avatar);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (deleteError) {
      console.log("Could not delete avatar from Cloudinary:", deleteError);
    }

    // remove from database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
      },
    });

    res.status(200).json({
      message: "Avatar deleted successfully",
      user: {
        ...updatedUser,
        avatar: `https://ui-avatars.com/api/?name=${currentUser.firstName[0]}${currentUser.lastName[0]}&size=200&background=random`,
        hasCustomAvatar: false,
      },
    });
  } catch (err) {
    console.error("Delete avatar error:", err);
    res.status(500).json({ msg: "Error deleting avatar" });
  }
};

export const getAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { size = "200" } = req.query;

    if (!userId) {
      res.status(400).json({ msg: "User ID is required" });
      return;
    }

    const { prisma } = await import("../utils/prisma");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true, firstName: true, lastName: true },
    });

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    if (!user.avatar) {
      const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
      const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${initials}&size=${size}&background=random`;

      res.status(200).json({
        avatar: defaultAvatarUrl,
        isDefault: true,
        canDownload: false,
      });
      return;
    }

    const publicId = extractPublicIdFromUrl(user.avatar);
    if (publicId) {
      const optimizedUrl = cloudinary.url(publicId, {
        width: parseInt(size as string),
        height: parseInt(size as string),
        crop: "fill",
        gravity: "face",
        radius: "max",
        quality: "auto",
        fetch_format: "auto",
      });

      res.status(200).json({
        avatar: optimizedUrl,
        originalAvatar: user.avatar,
        isDefault: false,
        canDownload: false,
      });
    } else {
      res.status(200).json({
        avatar: user.avatar,
        isDefault: false,
        canDownload: false,
      });
    }
  } catch (err) {
    console.error("Get avatar error:", err);
    res.status(500).json({ msg: "Error getting avatar" });
  }
};

export const downloadAvatar = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (currentUserId !== targetUserId) {
      res.status(403).json({ msg: "You can only download your own avatar" });
      return;
    }

    const { prisma } = await import("../utils/prisma");

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { avatar: true, firstName: true, lastName: true },
    });

    if (!user) {
      res.status(404).json({ msg: "User not found" });
    }

    if (!user?.avatar) {
      res.status(400).json({ msg: "No custom avatar to download" });
      return;
    }

    const publicId = extractPublicIdFromUrl(user.avatar);
    if (publicId) {
      const fullSizeUrl = cloudinary.url(publicId, {
        quality: "100",
        fetch_format: "auto",
        flags: "attachment",
      });

      res.status(200).json({
        downloadUrl: fullSizeUrl,
        originalUrl: user.avatar,
        message: "Avatar download link generated successfully",
      });
    } else {
      res.status(200).json({
        downloadUrl: user.avatar,
        message: "Avatar download link generated successfully",
      });
    }
  } catch (err) {
    console.error("Download avatar error:", err);
    res.status(500).json({ msg: "Error generating download link" });
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

// Middleware for single file upload, avatar upload, multiple files upload (for future use)
export const singleUpload = upload.single("image");
export const avatarUpload = upload.single("avatar");
export const multipleUpload = upload.array("images", 5);
