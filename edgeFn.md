# Supabase Edge Functions for Imageboard

This document outlines the necessary Supabase Edge Functions to power the backend logic, authorization, and actions for the imageboard application. These functions work in conjunction with Row Level Security (RLS) policies on the database tables and Storage policies.

**General Approach:**

* **API Layer:** Functions serve as the primary API endpoints for the React frontend.
* **Authorization:** Functions perform explicit checks for user roles (user, moderator, admin) and ownership where necessary.
* **Business Logic:** Functions encapsulate logic like image handling, tripcode generation, updating timestamps, etc.
* **Security:** Functions often run with elevated privileges (`service_role` key or PostgreSQL `SECURITY DEFINER` functions called internally) to bypass stricter RLS policies meant for direct client access, but they *must* perform thorough authorization checks internally.
* **Input Validation:** All functions must rigorously validate incoming data.

---

## Board Management Functions

### `createBoard`

* **Purpose:** Allows an administrator to create a new board category.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/create-board`
* **Authentication:** Required (Admin role).
* **Authorization Logic:** Checks if the calling user has the 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "short_name": "g",
    "name": "Technology",
    "description": "Discussions about technology."
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated and has 'admin' role.
  2. Validate input data (`short_name`, `name` are required, `short_name` uniqueness check).
  3. Insert a new record into the `boards` table.
* **Output (Success):** `{ "success": true, "board": { ...new board data... } }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | Invalid input | Board already exists" }` (with appropriate HTTP status code)

### `deleteBoard`

* **Purpose:** Allows an administrator to delete a board (and consequently its threads and posts via CASCADE).
* **HTTP Method:** `POST` (or `DELETE`, but `POST` often simpler for functions)
* **Endpoint:** `/api/functions/v1/delete-board`
* **Authentication:** Required (Admin role).
* **Authorization Logic:** Checks if the calling user has the 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "boardId": "uuid-of-board-to-delete"
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated and has 'admin' role.
  2. Validate `boardId`.
  3. Delete the record from the `boards` table (cascades to `threads` and `posts`).
* **Output (Success):** `{ "success": true }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | Board not found" }`

---

## Thread & Post Management Functions

### `createThread`

* **Purpose:** Creates a new thread (an OP post and its corresponding thread entry). Allows both anonymous and authenticated users.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/create-thread`
* **Authentication:** Optional (Anonymous allowed).
* **Authorization Logic:** None specific (open to post), relies on input validation and backend logic.
* **Input (Payload - FormData):**
  * `boardId`: UUID of the board.
  * `subject`: Text (optional).
  * `content`: Text (required).
  * `imageFile`: File (required, image type).
  * `tripcodePassword`: Text (optional, for anonymous users).
* **Core Actions:**
  1. Check authentication status (get `user_id` if authenticated).
  2. Validate inputs (board exists, content present, image file type/size).
  3. If anonymous and `tripcodePassword` provided, generate `tripcode` hash.
  4. Upload `imageFile` to `post_images` Storage bucket (handle compression/thumbnailing), get `image_url`, `thumbnail_url`, `image_original_filename`.
  5. **Start Transaction** (or use DB function for atomicity):
     a.  Insert into `posts` table (with `user_id` or `NULL`, `tripcode`, image URLs, subject, content, boardId, threadId=placeholder/defer). Get the new `post_id`.
     b.  Insert into `threads` table (linking `board_id`, `op_post_id` = new `post_id`, set `last_bumped_at` = now()). Get the new `thread_id`.
     c.  Update the previously inserted post record to set its `thread_id`.
  6. **Commit Transaction**.
* **Output (Success):** `{ "success": true, "threadId": 123, "postId": 456 }`
* **Output (Error):** `{ "success": false, "error": "Invalid input | Upload failed | Database error" }`

### `createReply`

* **Purpose:** Adds a reply post to an existing thread. Allows both anonymous and authenticated users.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/create-reply`
* **Authentication:** Optional (Anonymous allowed).
* **Authorization Logic:** None specific (open to post), relies on input validation.
* **Input (Payload - FormData):**
  * `threadId`: BigInt ID of the thread.
  * `content`: Text (required).
  * `imageFile`: File (optional, image type).
  * `tripcodePassword`: Text (optional, for anonymous users).
* **Core Actions:**
  1. Check authentication status (get `user_id` if authenticated).
  2. Validate inputs (thread exists, content present, image file type/size if provided).
  3. Fetch `boardId` from the target thread.
  4. If anonymous and `tripcodePassword` provided, generate `tripcode` hash.
  5. If `imageFile` provided, upload to `post_images` Storage bucket (handle compression/thumbnailing), get URLs/filename.
  6. **Start Transaction**:
     a.  Insert into `posts` table (with `user_id` or `NULL`, `tripcode`, optional image URLs, content, `threadId`, `boardId`).
     b.  Update the `threads` table for the given `threadId`: set `last_bumped_at` = now(), increment `reply_count` (and `image_count` if image added). (Alternatively, use DB triggers for counts/timestamp).
  7. **Commit Transaction**.
* **Output (Success):** `{ "success": true, "postId": 789 }`
* **Output (Error):** `{ "success": false, "error": "Invalid input | Thread not found | Upload failed | Database error" }`

### `deletePost`

* **Purpose:** Allows a moderator or administrator to delete a post (OP or reply).
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/delete-post`
* **Authentication:** Required (Moderator or Admin role).
* **Authorization Logic:** Checks if the calling user has 'moderator' or 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "postId": 12345
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated and has 'moderator' or 'admin' role.
  2. Validate `postId`. Find the post.
  3. (Optional) If post has an image, delete the image/thumbnail from `post_images` Storage bucket.
  4. Perform deletion:
     * **Soft Delete:** Update `posts` set `deleted_at` = now(). (Consider how this affects OP deletion and thread visibility).
     * **Hard Delete:** Delete the row from `posts`. If it's an OP, you might need to delete the corresponding `threads` entry too (or have CASCADE handle it if deleting the OP post itself isn't allowed directly, only deleting the *thread*). *Careful planning needed here.*
* **Output (Success):** `{ "success": true }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | Post not found | Deletion failed" }`

### `stickyThread`

* **Purpose:** Allows a moderator or administrator to sticky/unsticky a thread.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/sticky-thread`
* **Authentication:** Required (Moderator or Admin role).
* **Authorization Logic:** Checks if the calling user has 'moderator' or 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "threadId": 123,
    "isSticky": true | false
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated and has 'moderator' or 'admin' role.
  2. Validate `threadId` and `isSticky` value.
  3. Update the `threads` table set `is_sticky` = `isSticky` WHERE `id` = `threadId`.
* **Output (Success):** `{ "success": true }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | Thread not found | Update failed" }`

---

## User & Profile Management Functions

### `updateProfile`

* **Purpose:** Allows an authenticated user to update their own profile (e.g., username). Avatar update is separate.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/update-profile`
* **Authentication:** Required.
* **Authorization Logic:** Checks if the calling user's ID matches the profile ID being updated (`auth.uid() == id`).
* **Input (Payload - JSON):**
  ```json
  {
     // Only include fields to be updated
    "username": "new_username"
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated.
  2. Validate input (e.g., username format/uniqueness if changed).
  3. Update the `profiles` table for the `auth.uid()`, only allowing specific fields (`username`) to be changed. Update `updated_at`.
* **Output (Success):** `{ "success": true, "profile": { ...updated profile data... } }`
* **Output (Error):** `{ "success": false, "error": "Authentication required | Invalid input | Username taken | Update failed" }`

### `uploadAvatar`

* **Purpose:** Allows an authenticated user to upload/change their avatar.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/upload-avatar`
* **Authentication:** Required.
* **Authorization Logic:** Checks if the calling user is authenticated (`auth.uid()` exists).
* **Input (Payload - FormData):**
  * `avatarFile`: File (required, image type).
* **Core Actions:**
  1. Verify user is authenticated (`userId = auth.uid()`).
  2. Validate `avatarFile` (type, size).
  3. Generate a unique filename (e.g., using `userId`).
  4. (Optional) Delete the user's old avatar from the `avatars` Storage bucket, if it exists.
  5. Upload the new `avatarFile` to the `avatars` Storage bucket. Get the public URL or path (`avatarUrl`).
  6. Update the `profiles` table set `avatar_url` = `avatarUrl`, `updated_at` = now() WHERE `id` = `userId`.
* **Output (Success):** `{ "success": true, "avatarUrl": "..." }`
* **Output (Error):** `{ "success": false, "error": "Authentication required | Invalid file | Upload failed | Database update failed" }`

---

## Admin Functions

### `makeThreadPermanent`

* **Purpose:** Allows an administrator to make a thread permanent (exempt from pruning).
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/make-thread-permanent`
* **Authentication:** Required (Admin role).
* **Authorization Logic:** Checks if the calling user has the 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "threadId": 123,
    "isPermanent": true | false
  }
  ```
* **Core Actions:**
  1. Verify user is authenticated and has 'admin' role.
  2. Validate `threadId` and `isPermanent` value.
  3. Update the `threads` table set `is_permanent` = `isPermanent` WHERE `id` = `threadId`.
* **Output (Success):** `{ "success": true }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | Thread not found | Update failed" }`

### `updateUserRole`

* **Purpose:** Allows an administrator to change another user's role.
* **HTTP Method:** `POST`
* **Endpoint:** `/api/functions/v1/update-user-role`
* **Authentication:** Required (Admin role).
* **Authorization Logic:** Checks if the calling user has the 'admin' role.
* **Input (Payload - JSON):**
  ```json
  {
    "userId": "uuid-of-target-user",
    "newRole": "user" | "moderator" | "admin"
  }
  ```
* **Core Actions:**
  1. Verify calling user is authenticated and has 'admin' role.
  2. Validate `userId` and `newRole` (must be a valid `user_role` ENUM value). Ensure admin isn't accidentally demoting the last admin (optional check).
  3. Update `profiles` set `role` = `newRole` WHERE `id` = `userId`.
* **Output (Success):** `{ "success": true }`
* **Output (Error):** `{ "success": false, "error": "Permission denied | User not found | Invalid role | Update failed" }`

---

## Important Considerations

* **Error Handling:** Implement consistent error responses and use appropriate HTTP status codes (e.g., 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error).
* **Security Context:** Decide whether to use the `service_role` key directly within functions (simpler but less granular) or create PostgreSQL `SECURITY DEFINER` functions for database operations that need elevated privileges, calling those from the Edge Functions.
* **Input Validation:** Use libraries like `zod` for robust input schema validation within functions. Sanitize text content to prevent XSS attacks.
* **Atomic Operations:** For actions involving multiple steps (e.g., `createThread`), wrap database operations in a transaction or use a single database function to ensure atomicity.
* **Image Processing:** Decide where image compression/thumbnailing occurs (client-side before upload, or server-side triggered by Storage event or within the upload function).
* **Configuration:** Store sensitive information like `service_role` key securely using Supabase Function secrets.
* **RLS Complement:** Remember that RLS policies still act as a vital security layer preventing unauthorized direct database access.
