## Inspiration
1 teacher. 22 kids. 5 minutes each. That's 110 minutes a kindergarten teacher doesn't have.
We wanted to create a tool that helps kindergarten teachers overcome the challenge of being everywhere at once — introducing an AI classroom assistant that provides live handwriting feedback. Teachers set up student groups and start a session where students can independently learn to write their names, one letter at a time.

## What it does
The only login required is the teacher's. From their dashboard, teachers store student information, track active sessions, and monitor progress. They share a single 4-digit code with students to begin.
Students need no login and no typing. A simple number keypad gets them into the session. From there, they independently practice writing their name one letter at a time — guided entirely by on-device whiteboard annotations and immediate text-to-speech feedback. No reading comprehension required.
Every iPad becomes a personal assistant. Students are no longer bottlenecked by having just one teacher in the room.

# Tech Stack
## Frontend
| Component | Details |
|-----------|---------|
| **Next.js + React** | App Router, SSR |
| **tldraw** | Whiteboard canvas |
| **Supabase Auth** | Session, JWT |

## Backend (Next.js API Routes)
| Component | Details |
|-----------|---------|
| **API Routes** | REST endpoints |
| **Server Actions** | Mutations, triggers |
| **Supabase SDK** | DB + RLS queries |

## Database
| Component | Details |
|-----------|---------|
| **Postgres (Supabase)** | Tables, triggers, RLS |
| **Realtime** | Live session sync |
| **Storage** | Whiteboard assets |

## AI & Media
| Component | Details |
|-----------|---------|
| **Gemini 2.5 Flash Lite** | Image + text feedback |
| **ElevenLabs** | Text-to-speech |
| **Dev AI (Claude Code / Codex)** | Code generation tooling (not a production service) |

## User Interviews

### 1. Elementary School Teacher's Assistant
Though not a kindergarten teacher, we wanted to hear from an instructor who works closely with young children. Her biggest challenge was keeping students engaged and on-task for extended periods.
To address this for Letterling, we made the session length customizable: teachers control how many letters a student completes before the turn passes. To prevent a student from getting stuck, the turn automatically advances after 5 attempts on a single letter. The text-to-speech voice is also configured as a fun character to hold students' attention.

### 2. Kindergarten Education Assistant
Our second interviewee struggled with managing multiple students at the same time, a near-universal challenge in early childhood classrooms.
Letterling addresses this with an all-in-one teacher dashboard that shows progress across all students from a single screen. Teachers control when to start or pause a session, and have full flexibility over group size and the letter limit per turn.

## Outcomes
1. **Increase** the teacher to student ratio in classrooms
2. **Reduce** the effort required to give live feedback to student handwriting
3. **Improve** interactivity while learning with visual & verbal cues
4. **Minimize** number of clicks and manual help required by students to learn to write their name

## KPIs
1. 2 or more students actively practicing simultaneously with feedback
2. Live feedback delivered in < 3 seconds per letter submission for high interactivity
3. 0 teacher interventions required for a student to complete a full turn (letter prompt → draw → feedback → pass)
