import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase04CategoriesAndPublishing1786145000000 implements MigrationInterface {
  name = 'Phase04CategoriesAndPublishing1786145000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"), CONSTRAINT "PK_categories" PRIMARY KEY ("id"))`,
    );

    const categories = [
      ['gaming', 'Gaming'],
      ['music', 'Music'],
      ['education', 'Education'],
      ['entertainment', 'Entertainment'],
      ['tech', 'Tech'],
      ['sports', 'Sports'],
      ['news', 'News'],
      ['other', 'Other'],
    ];
    for (const [slug, name] of categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name") VALUES ($1, $2)`,
        [slug, name],
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."video_visibility_enum" AS ENUM('public', 'unlisted')`,
    );
    await queryRunner.query(`ALTER TABLE "videos" ADD "category_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "visibility" "public"."video_visibility_enum" NOT NULL DEFAULT 'unlisted'`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "published_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "view_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_category"`,
    );
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "view_count"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "published_at"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "visibility"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "category_id"`);
    await queryRunner.query(`DROP TYPE "public"."video_visibility_enum"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
