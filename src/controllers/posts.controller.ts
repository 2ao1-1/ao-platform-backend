import { Request, Response } from "express";
import { prisma } from "@/utils/prisma";

interface AuthRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

// Get all posts for feed
export const getFeed = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const userId = req.user?.id;

    const posts = await prisma.post.findMany({
      where: {
        // Search functionality
        OR: search
          ? [
              { title: { contains: search as string, mode: "insensitive" } },
              {
                description: {
                  contains: search as string,
                  mode: "insensitive",
                },
              },
            ]
          : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            bids: true,
          },
        },
        // Check if current user liked this post
        likes: userId
          ? {
              where: { userId },
              select: { id: true },
            }
          : false,
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    const totalPosts = await prisma.post.count();

    res.status(200).json({
      posts: posts.map((post) => ({
        ...post,
        isLiked: post.likes && post.likes.length > 0,
        likes: undefined, // Remove likes array, keep only isLiked
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalPosts,
        pages: Math.ceil(totalPosts / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get feed error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Create new post
export const createPost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { title, description, imageUrl, imageKey } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!title || !imageUrl || !imageKey) {
      res
        .status(400)
        .json({ msg: "Title, image URL, and image key are required" });
      return;
    }

    const post = await prisma.post.create({
      data: {
        title,
        description,
        imageUrl,
        imageKey,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Post created successfully",
      post,
    });
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get single post
export const getPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            bids: true,
          },
        },
      },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    res.status(200).json({ post });
  } catch (error) {
    console.error("Get post error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Update post
export const updatePost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const { title, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    // Check if post exists and user owns it
    const existingPost = await prisma.post.findFirst({
      where: {
        id: postId,
        authorId: userId,
      },
    });

    if (!existingPost) {
      res
        .status(404)
        .json({ msg: "Post not found or you don't have permission" });
      return;
    }

    // Can't update if post is in market
    if (existingPost.isInMarket) {
      res.status(400).json({ msg: "Cannot update post that is in market" });
      return;
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        title: title || existingPost.title,
        description: description || existingPost.description,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    res.status(200).json({
      message: "Post updated successfully",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Update post error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Delete post
export const deletePost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    // Check if post exists and user owns it
    const existingPost = await prisma.post.findFirst({
      where: {
        id: postId,
        authorId: userId,
      },
    });

    if (!existingPost) {
      res
        .status(404)
        .json({ msg: "Post not found or you don't have permission" });
      return;
    }

    // Can't delete if post has active bids
    if (existingPost.isInMarket) {
      const bidCount = await prisma.bid.count({
        where: { postId },
      });

      if (bidCount > 0) {
        res.status(400).json({ msg: "Cannot delete post with active bids" });
        return;
      }
    }

    // Delete post and related data
    await prisma.$transaction([
      prisma.like.deleteMany({ where: { postId } }),
      prisma.comment.deleteMany({ where: { postId } }),
      prisma.bid.deleteMany({ where: { postId } }),
      prisma.post.delete({ where: { id: postId } }),
    ]);

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Like/Unlike post
export const toggleLike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    // Check if already liked
    const existingLike = await prisma.like.findFirst({
      where: {
        postId,
        userId,
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      res.status(200).json({ message: "Post unliked", isLiked: false });
    } else {
      // Like
      await prisma.like.create({
        data: {
          postId,
          userId,
        },
      });
      res.status(200).json({ message: "Post liked", isLiked: true });
    }
  } catch (error) {
    console.error("Toggle like error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Add comment
export const addComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!content || content.trim().length === 0) {
      res.status(400).json({ msg: "Comment content is required" });
      return;
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      res.status(404).json({ msg: "Post not found" });
      return;
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Comment added successfully",
      comment,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};
