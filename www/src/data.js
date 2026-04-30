/* Vocabulary category metadata.
 * Loaded as a classic <script> so it works without module support.
 * Exposes globals:
 *   - CATEGORY_META: static category labels / accent colors (UI uses Lucide icons, not emoji)
 *   - CATEGORY_FALLBACK: fallback category key for unknown CSV categories
 *   - CANONICAL_ORDER: stable category ordering
 *   - DATA / ORDER: runtime-populated vocabulary dataset (from CSV loader)
 */

const CATEGORY_META = {
  greetings: { label: "Greetings", color: "#74C0FC" },
  numbers: { label: "Numbers 1–10", color: "#63E6BE" },
  colors: { label: "Colors", color: "#C5A3F0" },
  animals: { label: "Animals", color: "#FFD166" },
  food: { label: "Food", color: "#FF8C69" },
  body: { label: "Body Parts", color: "#FFB7C5" },
  days: { label: "Days of the Week", color: "#FFA94D" },
  family: { label: "Family", color: "#F783AC" },
  classroom: { label: "Classroom", color: "#4DABF7" },
  weather: { label: "Weather", color: "#339AF0" },
  seasons: { label: "Seasons & Nature", color: "#A9E34B" },
  transport: { label: "Transport", color: "#FF6B6B" },
  clothes: { label: "Clothes", color: "#E599F7" },
  sports: { label: "Sports", color: "#51CF66" },
  hobbies: { label: "Hobbies", color: "#FCC419" },
  house: { label: "Around the House", color: "#F59F00" },
  emotions: { label: "Feelings", color: "#FF8787" },
  months: { label: "Months", color: "#20C997" },
  jobs: { label: "Jobs", color: "#12B886" },
  instruments: { label: "Instruments", color: "#F06595" },
  insects: { label: "Insects & Bugs", color: "#82C91E" },
  japanesefood: { label: "Japanese Dishes", color: "#E8590C" },
  places: { label: "Places", color: "#7950F2" },
  adjectives: { label: "Adjectives", color: "#F76707" },
  verbs: { label: "Action Words", color: "#E03131" },
};

const CATEGORY_FALLBACK = "classroom";

const CANONICAL_ORDER = [
  "greetings", "numbers", "colors", "animals", "food", "body", "days",
  "family", "classroom", "weather", "seasons", "transport", "clothes",
  "sports", "hobbies", "house", "emotions", "months", "jobs", "instruments",
  "insects", "japanesefood", "places", "adjectives", "verbs",
];

let DATA = {};
let ORDER = [];
