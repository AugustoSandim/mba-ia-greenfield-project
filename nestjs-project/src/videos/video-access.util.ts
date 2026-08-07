import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/entities/video-status.enum';
import { VideoVisibility } from '../videos/entities/video-visibility.enum';

export function isVideoOwner(video: Video, channelId: string): boolean {
  return video.channelId === channelId;
}

export function isPublished(video: Video): boolean {
  return video.publishedAt !== null;
}

export function canAccessVideo(
  video: Video,
  ownerChannelId: string | undefined,
): boolean {
  if (ownerChannelId && isVideoOwner(video, ownerChannelId)) {
    return true;
  }
  if (video.status !== VideoStatus.READY || !isPublished(video)) {
    return false;
  }
  return true;
}

export function isListedPublicly(video: Video): boolean {
  return (
    video.status === VideoStatus.READY &&
    isPublished(video) &&
    video.visibility === VideoVisibility.PUBLIC
  );
}
