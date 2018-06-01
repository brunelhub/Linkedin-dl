# Linkedin-dl
**A NodeJs script to download courses from LinkedIn for personal offline use.**

---

## Installation:

You need to have NodeJs installed on your machine.

```sh
npm install -g https://github.com/brunelhub/linkedin-dl
```

## Usage:

Call linkedin-dl with the slug (name of the course) part of the URL, the username (email address) and the password.

```sh
ldl -s [the-course-name] -u [user@email.com] -p [password]
```

It will then try to log into your account and start downloading the videos.

![linkedin-dl demo](https://raw.githubusercontent.com/brunelhub/Linkedin-dl/master/gif/linkedin-dl.gif)

By default, linkedin-dl will select the biggest resolution available and create a subdirectory based on the course name.


## Arguments:

```sh
-s: only the course slug, ex: [leading-and-working-in-teams]
-u: user email used to connect to your linkedIn account
-p: password
```

