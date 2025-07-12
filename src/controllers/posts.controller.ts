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
    const {
      page = 1,
      limit = 30,
      search = "",
      category = "",
      tagName = "",
    } = req.query;
    const userId = req.user?.id;

    const whereCondition: any = {};

    if (search) {
      whereCondition.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }
    // Filter by category
    if (category) {
      whereCondition.category = {
        contains: category as string,
        mode: "insensitive",
      };
    }

    // Filter by tag
    if (tagName) {
      whereCondition.tagName = {
        contains: tagName as string,
        mode: "insensitive",
      };
    }

    const posts = await prisma.post.findMany({
      where: whereCondition,
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

    const totalPosts = await prisma.post.count({ where: whereCondition });

    res.status(200).json({
      posts: posts.map((post) => ({
        ...post,
        isLiked: post.likes && post.likes.length > 0,
        likes: undefined,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalPosts,
        pages: Math.ceil(totalPosts / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Create new post
export const createPost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { title, description, imageUrl, imageKey, tagName, category } =
      req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    if (!title || title.trim().length === 0) {
      res.status(400).json({ msg: "Title is required" });
      return;
    }

    if (!imageUrl && !imageKey) {
      res
        .status(400)
        .json({ msg: "Image key is required when uploading image" });
      return;
    }

    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        imageUrl: imageUrl || null,
        imageKey: imageKey || null,
        tagName: tagName?.trim() || null,
        category: category?.trim() || null,
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
            bids: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Post created successfully",
      post,
    });
  } catch (error) {
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
          where: { parentId: null },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },

            replies: {
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
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            _count: {
              select: {
                likes: true,
                replies: true,
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
    const { title, description, tagName, category } = req.body;
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
        tagName: tagName?.trim() || existingPost.tagName,
        category: category?.trim() || existingPost.category,
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
      },
    });

    res.status(200).json({
      message: "Post updated successfully",
      post: updatedPost,
    });
  } catch (error) {
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
    const commentIds = await prisma.comment.findMany({
      where: { postId },
      select: { id: true },
    });

    const commentIdArray = commentIds.map((c) => c.id);

    await prisma.$transaction([
      prisma.commentLike.deleteMany({
        where: {
          commentId: { in: commentIdArray },
        },
      }),
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
      await prisma.like.delete({
        where: { id: existingLike.id },
      });
      res.status(200).json({ message: "Post unliked", isLiked: false });
    } else {
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

// Add Comment
export const addComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;
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

    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment || parentComment.postId !== postId) {
        res.status(404).json({ msg: "Parent comment not found" });
        return;
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: userId,
        parentId: parentId ? String(parentId) : null,
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
        _count: { select: { likes: true, replies: true } },
      },
    });

    res.status(201).json({
      message: parentId
        ? "Reply added successfully"
        : "Comment added successfully",
      comment,
    });
  } catch (error) {
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Update Comment
export const updateComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { commentId } = req.params;
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

    const existingComment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        authorId: userId,
      },
    });

    if (!existingComment) {
      res
        .status(404)
        .json({ msg: "Comment not found or you don't have permission" });
      return;
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
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

    res.status(200).json({
      message: "Comment updated successfully",
      comment: updatedComment,
    });
  } catch (error) {
    console.error("Update comment error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Delete Comment
export const deleteComment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { commentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const existingComment = await prisma.comment.findFirst({
      where: { id: commentId, authorId: userId },
    });

    if (!existingComment) {
      res
        .status(404)
        .json({ msg: "Comment not found or you don't have permission" });
      return;
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (err) {
    console.error("Delete comment error:", err);

    res.status(500).json({ msg: "Internal server error" });
  }
};
