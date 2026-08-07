import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsModule } from '../comments/comments.module';
import { VideosModule } from '../videos/videos.module';
import { CommentLike } from './entities/comment-like.entity';
import { VideoLike } from './entities/video-like.entity';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoLike, CommentLike]),
    forwardRef(() => VideosModule),
    forwardRef(() => CommentsModule),
  ],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService, TypeOrmModule],
})
export class LikesModule {}
