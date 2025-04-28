
# BOARDS

| Column Name | Data Type                | Constraints/Notes                                  |
| :---------- | :----------------------- | :------------------------------------------------- |
| `id`        | `uuid`                   | Primary Key, Default: `gen_random_uuid()`          |
| `short_name`| `text`                   | **Required**, **Unique**. Used in URLs (e.g., "g"). |
| `name`      | `text`                   | **Required**. Display name (e.g., "Technology").   |
| `description`| `text`                   | Optional description for the board.                |
| `created_at`| `timestamp with time zone` | Default: `now()`                                   |
# PROFILES

| Column Name | Data Type                | Constraints/Notes                                                                      |
| :---------- | :----------------------- | :------------------------------------------------------------------------------------- |
| `id`        | `uuid`                   | Primary Key, **Required**, **Foreign Key** to `auth.users.id` (ON DELETE CASCADE).     |
| `username`  | `text`                   | **Required**, **Unique**. Public display name for registered users.                      |
| `role`      | `user_role`              | **Required**, Default: `'user'`. Uses the `user_role` ENUM type.                       |
| `avatar_url`| `text`                   | Nullable. URL/Path to the user's avatar image in Supabase Storage.                     |
| `created_at`| `timestamp with time zone` | **Required**, Default: `now()`.                                                        |
| `updated_at`| `timestamp with time zone` | **Required**, Default: `now()`. (Uses `moddatetime` trigger to auto-update on change). |


# THREADS

| Column Name | Data Type                | Constraints/Notes                                                                      |
| :---------- | :----------------------- | :------------------------------------------------------------------------------------- |
| `id`        | `uuid`                   | Primary Key, **Required**, **Foreign Key** to `auth.users.id` (ON DELETE CASCADE).     |
| `username`  | `text`                   | **Required**, **Unique**. Public display name for registered users.                      |
| `role`      | `user_role`              | **Required**, Default: `'user'`. Uses the `user_role` ENUM type.                       |
| `avatar_url`| `text`                   | Nullable. URL/Path to the user's avatar image in Supabase Storage.                     |
| `created_at`| `timestamp with time zone` | **Required**, Default: `now()`.                                                        |
| `updated_at`| `timestamp with time zone` | **Required**, Default: `now()`. (Uses `moddatetime` trigger to auto-update on change). |

# POSTS

| Column Name             | Data Type                | Constraints/Notes                                                                                                                                  |
| :---------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | `bigint`                 | Primary Key, **Identity** (auto-incrementing, `GENERATED ALWAYS AS IDENTITY`). Global post number across all threads/boards.                         |
| `thread_id`             | `bigint`                 | **Required**, **Foreign Key** to `threads.id` (ON DELETE CASCADE). Links post to its parent thread.                                                |
| `board_id`              | `uuid`                   | **Required**, **Foreign Key** to `boards.id` (ON DELETE CASCADE). Denormalized for easier board-level queries/RLS.                                  |
| `user_id`               | `uuid`                   | Nullable. **Foreign Key** to `auth.users.id` (ON DELETE SET NULL). Links to registered user if posted by one; NULL if anonymous.                     |
| `subject`               | `text`                   | Nullable. Intended for use by the Original Post (OP) only.                                                                                         |
| `content`               | `text`                   | **Required**. The main text body of the post.                                                                                                      |
| `tripcode`              | `text`                   | Nullable. Stores the generated tripcode hash for anonymous users who provide a password.                                                            |
| `image_url`             | `text`                   | Nullable. URL/Path to the main image file in Supabase Storage. **Required for OP**, Optional for replies.                                          |
| `thumbnail_url`         | `text`                   | Nullable. URL/Path to the thumbnail file in Supabase Storage.                                                                                     |
| `image_original_filename` | `text`                   | Nullable. Stores the original filename provided by the user during upload (mainly for display/reference).                                        |
| `created_at`            | `timestamp with time zone` | **Required**, Default: `now()`. Timestamp when the post was created.                                                                              |
| `deleted_at`            | `timestamp with time zone` | Nullable. Used for soft deletion if implemented. Posts with a non-null value are considered deleted.                                              |