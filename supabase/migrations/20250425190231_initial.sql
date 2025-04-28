

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'janitor',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "short_name" "text",
    "description" "text"
);


ALTER TABLE "public"."boards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" bigint NOT NULL,
    "thread_id" bigint NOT NULL,
    "board_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "subject" "text",
    "content" "text" NOT NULL,
    "tripcode" "text",
    "image_url" "text",
    "thumbnail_url" "text",
    "image_original_filename" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."posts"."id" IS 'Global auto-incrementing primary key for all posts.';



COMMENT ON COLUMN "public"."posts"."thread_id" IS 'Link to the thread this post belongs to.';



COMMENT ON COLUMN "public"."posts"."board_id" IS 'Denormalized link to the board for easier filtering.';



COMMENT ON COLUMN "public"."posts"."user_id" IS 'Link to the registered user who made the post, if any.';



COMMENT ON COLUMN "public"."posts"."subject" IS 'Subject line, typically used only for the Original Post (OP).';



COMMENT ON COLUMN "public"."posts"."content" IS 'The main text content of the post.';



COMMENT ON COLUMN "public"."posts"."tripcode" IS 'Hashed tripcode for semi-anonymous identification.';



COMMENT ON COLUMN "public"."posts"."image_url" IS 'URL/Path to the full-size image in storage, if any.';



COMMENT ON COLUMN "public"."posts"."thumbnail_url" IS 'URL/Path to the thumbnail image in storage, if any.';



COMMENT ON COLUMN "public"."posts"."image_original_filename" IS 'Original filename of the uploaded image.';



COMMENT ON COLUMN "public"."posts"."created_at" IS 'Timestamp when the post was created.';



COMMENT ON COLUMN "public"."posts"."deleted_at" IS 'Timestamp for soft deletion (if feature is implemented).';



ALTER TABLE "public"."posts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Stores public profile information for users, extending auth.users.';



COMMENT ON COLUMN "public"."profiles"."id" IS 'User ID, matches the corresponding id in auth.users.';



COMMENT ON COLUMN "public"."profiles"."username" IS 'Public, unique username for the user.';



COMMENT ON COLUMN "public"."profiles"."role" IS 'User role (user, moderator, admin) defined by the user_role ENUM.';



COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'URL/Path to the user''s avatar image in Supabase Storage.';



COMMENT ON COLUMN "public"."profiles"."created_at" IS 'Timestamp when the profile was created.';



COMMENT ON COLUMN "public"."profiles"."updated_at" IS 'Timestamp when the profile was last updated.';



CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" bigint NOT NULL,
    "board_id" "uuid" NOT NULL,
    "op_post_id" bigint NOT NULL,
    "is_sticky" boolean DEFAULT false NOT NULL,
    "is_permanent" boolean DEFAULT false NOT NULL,
    "last_bumped_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "image_count" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."threads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."threads"."id" IS 'Auto-incrementing primary key for the thread.';



COMMENT ON COLUMN "public"."threads"."board_id" IS 'Link to the board this thread belongs to.';



COMMENT ON COLUMN "public"."threads"."op_post_id" IS 'Link to the specific post ID that started this thread (the OP).';



COMMENT ON COLUMN "public"."threads"."is_sticky" IS 'If true, the thread is pinned to the top of the board.';



COMMENT ON COLUMN "public"."threads"."is_permanent" IS 'If true, the thread is not subject to automatic pruning.';



COMMENT ON COLUMN "public"."threads"."last_bumped_at" IS 'Timestamp of the last activity (OP creation or reply) used for ordering threads.';



COMMENT ON COLUMN "public"."threads"."created_at" IS 'Timestamp when the thread (specifically the OP) was created.';



COMMENT ON COLUMN "public"."threads"."reply_count" IS 'Cached count of replies in the thread (excluding the OP).';



COMMENT ON COLUMN "public"."threads"."image_count" IS 'Cached count of images in the thread (including the OP).';



ALTER TABLE "public"."threads" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."threads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_short_name_key" UNIQUE ("short_name");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_op_post_id_key" UNIQUE ("op_post_id");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_op_post_id_fkey" FOREIGN KEY ("op_post_id") REFERENCES "public"."posts"("id");



CREATE POLICY "Allow public read access" ON "public"."profiles" FOR SELECT USING (true);



ALTER TABLE "public"."boards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "postgres";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";


















GRANT ALL ON TABLE "public"."boards" TO "anon";
GRANT ALL ON TABLE "public"."boards" TO "authenticated";
GRANT ALL ON TABLE "public"."boards" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."threads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."threads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."threads_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
