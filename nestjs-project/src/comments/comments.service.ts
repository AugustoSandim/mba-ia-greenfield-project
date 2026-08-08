import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import { CommentNotFoundException } from './exceptions/comment.exceptions';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  CommentAuthorDto,
  CommentResponseDto,
} from './dto/comment-response.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly channelsService: ChannelsService,
  ) {}

  async listByVideo(videoId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { videoId },
      order: { createdAt: 'ASC' },
    });
  }

  private async resolveAuthor(userId: string): Promise<CommentAuthorDto> {
    const channel = await this.channelsService.findChannelByUserId(userId);
    return {
      id: userId,
      name: channel.name,
      nickname: channel.nickname,
      avatarUrl: null,
    };
  }

  private mapComment(
    comment: Comment,
    author: CommentAuthorDto,
    replies: CommentResponseDto[],
  ): CommentResponseDto {
    return {
      id: comment.id,
      content: comment.body,
      createdAt: comment.createdAt,
      likesCount: 0,
      dislikesCount: 0,
      viewerReaction: 'none',
      author,
      replies,
    };
  }

  async listByVideoEnriched(videoId: string): Promise<CommentResponseDto[]> {
    const comments = await this.listByVideo(videoId);
    const authorCache = new Map<string, CommentAuthorDto>();
    const getAuthor = async (userId: string) => {
      const cached = authorCache.get(userId);
      if (cached) {
        return cached;
      }
      const author = await this.resolveAuthor(userId);
      authorCache.set(userId, author);
      return author;
    };

    const tops = comments.filter((comment) => !comment.parentId);
    const replies = comments.filter((comment) => comment.parentId);

    return Promise.all(
      tops.map(async (comment) => {
        const author = await getAuthor(comment.userId);
        const nested = await Promise.all(
          replies
            .filter((reply) => reply.parentId === comment.id)
            .map(async (reply) =>
              this.mapComment(reply, await getAuthor(reply.userId), []),
            ),
        );
        return this.mapComment(comment, author, nested);
      }),
    );
  }

  async create(
    videoId: string,
    userId: string,
    dto: CreateCommentDto,
    parentId?: string,
  ): Promise<Comment> {
    if (parentId) {
      const parent = await this.commentRepository.findOne({
        where: { id: parentId, videoId },
      });
      if (!parent) {
        throw new CommentNotFoundException();
      }
      if (parent.parentId) {
        throw new CommentNotFoundException();
      }
    }

    return this.commentRepository.save(
      this.commentRepository.create({
        videoId,
        userId,
        parentId: parentId ?? null,
        body: dto.body,
      }),
    );
  }

  async createEnriched(
    videoId: string,
    userId: string,
    dto: CreateCommentDto,
    parentId?: string,
  ): Promise<CommentResponseDto> {
    const saved = await this.create(videoId, userId, dto, parentId);
    const author = await this.resolveAuthor(userId);
    return this.mapComment(saved, author, []);
  }

  async delete(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment || comment.userId !== userId) {
      throw new CommentNotFoundException();
    }
    await this.commentRepository.delete(commentId);
  }

  async countByVideo(videoId: string): Promise<number> {
    return this.commentRepository.count({ where: { videoId } });
  }

  async findById(commentId: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }
    return comment;
  }
}
