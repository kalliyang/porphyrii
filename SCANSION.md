# Scansion and recitation

## Supported analysis

The metre solver supports dactylic hexameter and elegiac pentameter. An elegiac
couplet starts with a hexameter and alternates the two forms. An isolated
pentameter is also accepted. Other metres retain restored text and learning notes
without an asserted foot pattern.

The solver consumes vowel quantities from the supplied or restored text. It does
not turn a vowel long just because a syllable is heavy by position. Its output is
conditional on those quantities: fitting a metre does not prove the lexical
restoration correct.

Hexameter permits dactyls or spondees in the first five feet and a final longum
plus anceps; a spondaic fifth foot is explicitly noted. Pentameter has two variable
feet and a longum, a word boundary at the central division, then two dactyls and
a final anceps. Mute-plus-liquid variation uses the quantity engine's existing
rules. Editorial punctuation remains visible in the source but does not force a
break in the metrical reading.

Ordinary vowel/diphthong or vowel-m elision before a vowel or h is tried first.
Hiatus is a less-preferred alternative. If no ordinary reading fits, the solver
can try one unmarked i/u becoming a glide. Orthographic -aum/-eum endings admit
a hiatus interpretation for final -um elision. The bounded search stops at 256
candidates. It is not a complete treatment of Greek names, synizesis, or poetic
licenses. Supplied quantity marks are preserved.

Only when the original user input was unmarked, a finite additional pass may
consider attested alternatives: final i in mihi/tibi/sibi/ibi/ubi, selected
pronominal genitives in -ius, the present/perfect quantity of venit, and poetic
initial quantity in Italia forms. Each chosen change is shown beside the line;
the restored source text is retained separately from that reading. See
[Allen and Greenough 603](https://dcc.dickinson.edu/grammar/latin/category-search?field_gl_section_number_value=603)
and [604](https://dcc.dickinson.edu/grammar/latin/quantity-final-syllables).
This is not a general dictionary or permission to flip arbitrary vowels.

The Teucr- name family is explicitly unsupported for metrical analysis: the
current G2P's unlisted-eu hiatus can otherwise produce a false dactyl. Other
exceptional Greek names may also remain unresolved.

Multiple equally preferred readings produce `ambiguous`; no supported reading
produces `unresolved`. Both have empty foot arrays. A valid partial result is
retained if an optional restoration review fails. Confirmed lines are not
rewritten during that review.

## Result and display contract

`scansion_version: 1` identifies programmatically derived results. Each line has
`line`, `text`, `meter`, `status`, `feet`, `foot_types`, and `note`. Resolved lines
also include a `pattern` and a `pronunciation` recipe (`text`, `overrides`).

- `status` is `resolved`, `ambiguous`, `unresolved`, `unsupported`, or `prose`.
- Feet contain `{s, q, elided, anceps?}` syllable entries. Elided entries have no
  metrical mark. The final anceps is displayed as `x`.
- A liaison syllable may contain an inline omitted fragment, such as `l(e)et`.
  That is one pronounced syllable, with the parenthesized letters silent.
- Source letters, including omitted fragments, remain reconstructable in order.
- The frontend rechecks computed feet before rendering. Old saved results also
  receive foot-structure and transport checks; failed marks are hidden.
- Grammar and translation are plain text. They cannot introduce HTML or replace
  the computed metrical display.

## Recitation

The default synthesis rate is 110, with 80, 140, and 175 available. These are
engine rate settings, not exact words-per-minute measurements for Latin IPA.
Changing speed stops the current reading; Play starts it again at the new rate.
The app limits chunks to 120 IPA characters and adds a short gap between chunks.

Resolved lines use the solver's pronunciation recipe, so elision and contraction
agree with the displayed reading. Unconfirmed lines remain available as a labeled
text reading without inferred elision. Neither global rate nor metrical labels
promise strict mora timing, an exact 2:1 acoustic duration ratio, or identical PCM
samples across repeated engine calls.

## Verification boundary

Unit fixtures exercise quantities, complete feet, source-letter reconstruction,
ambiguous/unresolved behavior, legacy-history failures, provider envelopes, and
playback cancellation. Metrical patterns in fixed reference fixtures are not a
claim of accuracy on arbitrary input. Live model quality and browser playback
must be checked on representative examples when the integration changes.
