# Al Jazeera Design Language — Extracted Tokens

## Color Palette

### Primary
- **White:** `#FFFFFF` — backgrounds, cards
- **Black:** `#000000` — primary text, headers, nav
- **AJ Blue:** `#118ADD` — links, interactive elements, focus rings
- **AJ Red/Crimson:** `#C31833` — breaking news, alerts, urgent

### Secondary  
- **Dark Gray:** `#333333` — secondary text
- **Medium Gray:** `#595959` — body text, captions
- **Light Gray:** `#969696` — muted text, metadata
- **Border Gray:** `#E5E5E5` — dividers, borders
- **Background Gray:** `#F0F0F0` — section backgrounds
- **Light Background:** `#F7F7F7` — card backgrounds

### Accent (per-theme)
- **AJE (English):** `#FA9000` (orange)
- **AJB (Balkans):** `#D9571E` (burnt orange)
- **AJM (Mubasher):** `#8D2DDA` (purple)

### Status Colors
- **Error/Breaking:** `#E00102`
- **Warning/Gold:** `#DBA200`
- **Info/Teal:** `#1D9EB4`

## Typography

### Font Families
- **Primary:** `"Roboto", "Helvetica Neue", "Helvetica", "Arial", sans-serif` (English)
- **Arabic:** `"Al-Jazeera", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
- **Article Body (serif):** `"Georgia", "Times New Roman", "Times", serif`

### Font Sizes (Mobile → Desktop)
- **Heading XL:** 32px → 42px
- **Heading L:** 24px → 30px
- **Heading M:** 20px → 24px
- **Heading S:** 18px → 22px
- **Body:** 16px (1rem)
- **Body Article:** 18px (1.125rem) → 20px (1.25rem) → 22px (1.375rem)
- **Caption:** 14px (0.875rem)
- **Small:** 12px (0.75rem)
- **Tiny:** 11px

### Font Weights
- **Light:** 300 (article body)
- **Regular:** 400 (most common)
- **Medium:** 500
- **Bold:** 700 (headings)
- **Black:** 900 (rare, emphasis)

### Line Heights
- Headlines: CSS variable `--leading-headline`
- Body: 1.5
- Multiline: CSS variable `--leading-multilines`

## Spacing & Layout
- **Border Radius (buttons, pills):** 100px, 22px, 20px
- **Border Radius (cards):** 10px, 8px
- **Border Radius (small elements):** 4px, 5px
- **Circular elements:** 50%
- **Letter Spacing:** 0 (default), 1px (rare)

## Shadows & Overlays
- **Light shadow:** `rgba(0,0,0,0.16)`
- **Medium overlay:** `rgba(0,0,0,0.5)`
- **Dark overlay:** `rgba(0,0,0,0.7)`

## Design Principles
- Clean, high-contrast black & white base
- Blue as the primary interactive/brand color
- Minimal border-radius (mostly pills or subtle rounds)
- Heavy use of whitespace
- Strong typographic hierarchy
- Cards with subtle borders rather than shadows
