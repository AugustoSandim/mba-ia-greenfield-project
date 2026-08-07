import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosModule } from '../videos/videos.module';
import { Comment } from './entities/comment.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    forwardRef(() => VideosModule),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService, TypeOrmModule],
})
export class CommentsModule {}
