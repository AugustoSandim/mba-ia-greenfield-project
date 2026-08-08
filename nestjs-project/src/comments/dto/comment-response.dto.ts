export class CommentAuthorDto {
  id: string;
  name: string;
  nickname: string;
  avatarUrl: string | null;
}

export class CommentResponseDto {
  id: string;
  content: string;
  createdAt: Date;
  likesCount: number;
  dislikesCount: number;
  viewerReaction: 'like' | 'dislike' | 'none';
  author: CommentAuthorDto;
  replies: CommentResponseDto[];
}
