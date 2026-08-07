import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentNotFoundException } from './exceptions/comment.exceptions';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
  ) {}

  async listByVideo(videoId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { videoId },
      order: { createdAt: 'ASC' },
    });
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
