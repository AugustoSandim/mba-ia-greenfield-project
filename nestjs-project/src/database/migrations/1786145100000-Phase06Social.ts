import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase06Social1786145100000 implements MigrationInterface {
  name = 'Phase06Social1786145100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video_id" uuid NOT NULL, "user_id" uuid NOT NULL, "parent_id" uuid, "body" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_comments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_parent" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "video_likes" ("user_id" uuid NOT NULL, "video_id" uuid NOT NULL, "value" smallint NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_video_likes" PRIMARY KEY ("user_id", "video_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_likes" ADD CONSTRAINT "FK_video_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_likes" ADD CONSTRAINT "FK_video_likes_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "comment_likes" ("user_id" uuid NOT NULL, "comment_id" uuid NOT NULL, "value" smallint NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_comment_likes" PRIMARY KEY ("user_id", "comment_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_likes" ADD CONSTRAINT "FK_comment_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_likes" ADD CONSTRAINT "FK_comment_likes_comment" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("subscriber_id" uuid NOT NULL, "channel_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_subscriptions" PRIMARY KEY ("subscriber_id", "channel_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_subscriber" FOREIGN KEY ("subscriber_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "comment_likes"`);
    await queryRunner.query(`DROP TABLE "video_likes"`);
    await queryRunner.query(`DROP TABLE "comments"`);
  }
}
