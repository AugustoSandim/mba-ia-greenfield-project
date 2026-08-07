import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentLike } from './entities/comment-like.entity';
import { VideoLike } from './entities/video-like.entity';

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(VideoLike)
    private readonly videoLikeRepository: Repository<VideoLike>,
    @InjectRepository(CommentLike)
    private readonly commentLikeRepository: Repository<CommentLike>,
  ) {}

  async setVideoLike(
    userId: string,
    videoId: string,
    value: number,
  ): Promise<void> {
    await this.videoLikeRepository.save(
      this.videoLikeRepository.create({ userId, videoId, value }),
    );
  }

  async removeVideoLike(userId: string, videoId: string): Promise<void> {
    await this.videoLikeRepository.delete({ userId, videoId });
  }

  async getVideoLikeCounts(
    videoId: string,
  ): Promise<{ likes: number; dislikes: number }> {
    const rows = await this.videoLikeRepository.find({ where: { videoId } });
    return rows.reduce(
      (acc, row) => {
        if (row.value > 0) acc.likes += 1;
        else acc.dislikes += 1;
        return acc;
      },
      { likes: 0, dislikes: 0 },
    );
  }

  async setCommentLike(
    userId: string,
    commentId: string,
    value: number,
  ): Promise<void> {
    await this.commentLikeRepository.save(
      this.commentLikeRepository.create({ userId, commentId, value }),
    );
  }

  async removeCommentLike(userId: string, commentId: string): Promise<void> {
    await this.commentLikeRepository.delete({ userId, commentId });
  }
}
