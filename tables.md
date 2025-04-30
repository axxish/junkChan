# BOARDS

| Column Name   | Data Type                  | Constraints/Notes                                   |
| :------------ | :------------------------- | :-------------------------------------------------- |
| `id`          | `uuid`                     | Primary Key, Default: `gen_random_uuid()`           |
| `short_name`  | `text`                     | **Required**, **Unique**. Used in URLs (e.g., "g"). |
| `name`        | `text`                     | **Required**. Display name (e.g., "Technology").    |
| `description` | `text`                     | Optional description for the board.                 |
| `created_at`  | `timestamp with time zone` | Default: `now()`                                    |

# PROFILES

| Column   |Type                             | Constraints                                           |
| :----------- | :------------------------- | :-------------------------------------------------------------- |
| `id`         | `uuid`                     | Primary Key, **Required**, **Foreign Key** to `auth.users.id` (ON DELETE CASCADE).     |
| `username`   | `text`                     | **Required**, **Unique**. Public display name for registered users.                    |
| `role`       | `user_role`                | **Required**, Default: `'user'`. Uses the `user_role` ENUM type.                       |
| `avatar_url` | `text`                     | Nullable. URL/Path to the user's avatar image in Supabase Storage.                     |
| `created_at` | `timestamp with time zone` | **Required**, Default: `now()`.                                                        |
| `updated_at` | `timestamp with time zone` | **Required**, Default: `now()`. (Uses `moddatetime` trigger to auto-update on change). |

# THREADS

| Column           | Type                       | Constraints & Notes                                           |
| :--------------- | :------------------------- | :------------------------------------------------------------ |
| `id`             | `bigint`                   | Primary Key, Generated always as identity                     |
| `board_id`       | `uuid`                     | Foreign Key (`boards.id` ON DELETE CASCADE), Not Null         |
| `op_post_id`     | `bigint`                   | Foreign Key (`posts.id` ON DELETE CASCADE), Not Null, Unique  |
| `subject`        | `text`                     | **Added:** Nullable (though typically set on creation)        |
| `last_bumped_at` | `timestamp with time zone` | Not Null, Indexed (for sorting threads)                       |
| `reply_count`    | `integer`                  | Not Null, Default: `0`                                        |
| `image_count`    | `integer`                  | Not Null, Default: `0`                                        |
| `is_sticky`      | `boolean`                  | Not Null, Default: `FALSE`, Indexed (for sorting threads)     |
| `is_locked`      | `boolean`                  | Not Null, Default: `FALSE`                                    |
| `is_permanent`   | `boolean`                  | Not Null, Default: `FALSE` (Prevents pruning by cleanup jobs) |
| `created_at`     | `timestamp with time zone` | Not Null, Default: `now()`                                    |

# POSTS

| Column                    | Type                       | Constraints & Notes                                      |
| :------------------------ | :------------------------- | :------------------------------------------------------- |
| `id`                      | `bigint`                   | Primary Key, Generated always as identity                |
| `board_id`                | `uuid`                     | Foreign Key (`boards.id`), Not Null                      |
| `user_id`                 | `uuid`                     | Foreign Key (`auth.users.id`), Nullable (for anon posts) |
| `thread_id`               | `bigint`                   | Foreign Key (`threads.id` ON DELETE CASCADE), Nullable   |
| `subject`                 | `text`                     | Nullable (Usually only OP has subject here)              |
| `content`                 | `text`                     | Not Null                                                 |
| `tripcode`                | `text`                     | Nullable (for anon users with password)                  |
| `image_url`               | `text`                     | Nullable (posts don't always have images)                |
| `thumbnail_url`           | `text`                     | Nullable                                                 |
| `image_original_filename` | `text`                     | Nullable                                                 |
| `is_op`                   | `boolean`                  | **Added:** Not Null, Default: `FALSE`                    |
| `created_at`              | `timestamp with time zone` | Not Null, Default: `now()`                               |
