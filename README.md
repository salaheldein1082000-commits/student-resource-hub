# Student Resource Hub

RESOURCES HUB (shared page for all students)

- Table resources(id, unit_no, learning_aim, title, type: video | pdf | link | slides | template, url, description, linked_criteria[] (e.g. A.P1, A.M1), is_pinned, visible_from, is_published, sort_order)

- Students see a "Resources" page grouped by Learning Aim, with filters by type and criterion, plus a search box.

- Videos are embedded from YouTube/Vimeo unlisted links with an in-page player; PDFs open in a viewer with a download button.

- Assessor can add/edit/reorder/hide resources and pin important ones.

- Optional: resource_views(student_id, resource_id, viewed_at) so the assessor can see who watched what.

- On the student's feedback page, for every criterion NOT achieved, show the linked resources for that criterion as "Helpful materials".

- Add an "Announcements" strip at the top of the Resources page for the assessor's notices (deadline reminders, exam tips).

EXTRAS

- Digital authentication/declaration checkbox on upload, stored with timestamp.

- Feedback bank: reusable comment snippets per criterion for the assessor.

- Attempt history per submission.

- Dashboard with submission rate and criteria-achievement stats.

This project was built with [Lovable](https://lovable.dev).

## Authentication

Students sign in with an 8-digit student code and password. The app maps the code to Supabase
Auth's internal email alias format (`<student-code>@student.local`), so students only see and
enter their code. The migration seeds the development account `01090680` with the requested
password; change it before using the project with real students.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/22d62a82-dd32-42ad-8541-c4d7a22223c3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
