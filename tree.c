/*
 * tree - 以树状图形式列出目录内容
 *
 * 用法: tree [-adf] [-L level] [-o file] [directory]
 *
 * 模仿 Linux tree 命令的核心功能:
 *   -a    显示所有文件（包括以 . 开头的文件）
 *   -d    仅显示目录
 *   -f    显示完整的路径前缀
 *   -L n  最大显示深度
 *   -o f  输出到文件
 */

#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <locale.h>
#include <stdbool.h>

/* 颜色定义（用 ANSI 转义序列） */
#define C_RESET   "\033[0m"
#define C_DIR     "\033[1;34m"  /* 粗体蓝色 */
#define C_EXE     "\033[1;32m"  /* 粗体绿色 */
#define C_LINK    "\033[1;36m"  /* 粗体青色 */
#define C_SOCK    "\033[1;33m"  /* 粗体黄色 */
#define C_FIFO    "\033[1;33m"  /* 粗体黄色 */
#define C_DEV     "\033[1;33m"  /* 粗体黄色 */
#define C_ORPHAN  "\033[1;31m"  /* 粗体红色（断开的符号链接） */

/* 全局选项 */
static bool flag_all     = false;
static bool flag_dirs    = false;
static bool flag_full    = false;
static int  max_depth    = -1;       /* -1 表示无限制 */
static FILE *out         = NULL;
static bool use_color    = true;

/* 统计信息 */
static unsigned long total_dirs  = 0;
static unsigned long total_files = 0;

/* 检查是否为符号链接断链 */
static bool is_broken_link(const char *path)
{
    struct stat st;
    /* 先用 lstat 看是不是符号链接 */
    if (lstat(path, &st) != 0)
        return false;
    if (!S_ISLNK(st.st_mode))
        return false;
    /* 再用 stat 看能不能解析目标 */
    return stat(path, &st) != 0;
}

/* 根据文件类型返回颜色字符串 */
static const char *file_color(const char *path, mode_t mode, bool is_link)
{
    (void)path;
    if (!use_color)
        return "";

    if (S_ISDIR(mode))
        return C_DIR;
    if (is_link)
        return is_broken_link(path) ? C_ORPHAN : C_LINK;
    if (S_ISSOCK(mode))
        return C_SOCK;
    if (S_ISFIFO(mode))
        return C_FIFO;
    if (S_ISCHR(mode) || S_ISBLK(mode))
        return C_DEV;
    if (mode & (S_IXUSR | S_IXGRP | S_IXOTH))
        return C_EXE;
    return "";
}

static const char *color_reset(void)
{
    return use_color ? C_RESET : "";
}

/* 在条目名称后附加类型符号（类似系统 tree 的标记） */
static void print_entry_type(mode_t mode, bool is_broken)
{
    if (is_broken) {
        fputc('_', out);
        fputc('>', out);
        return;
    }
    if (S_ISDIR(mode))
        return;   /* 目录无后缀 */
    if (mode & (S_IXUSR | S_IXGRP | S_IXOTH))
        fputc('*', out);
}

/*
 * 读取目录内容并排序（简单的冒泡排序，因为目录项通常不多）
 * 返回排序后的 dirent 指针数组，以 NULL 结尾
 */
static struct dirent **read_sorted_dir(const char *dirpath, size_t *count_out)
{
    DIR *dir = opendir(dirpath);
    if (!dir) {
        *count_out = 0;
        return NULL;
    }

    size_t cap  = 64;
    size_t cnt  = 0;
    struct dirent **list = malloc(cap * sizeof(struct dirent *));
    if (!list) {
        closedir(dir);
        *count_out = 0;
        return NULL;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        /* 跳过 . 和 .. */
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
            continue;
        /* 隐藏文件处理 */
        if (!flag_all && entry->d_name[0] == '.')
            continue;

        if (cnt >= cap) {
            cap *= 2;
            struct dirent **tmp = realloc(list, cap * sizeof(struct dirent *));
            if (!tmp) break;
            list = tmp;
        }
        /* 复制 dirent */
        list[cnt] = malloc(sizeof(struct dirent));
        if (!list[cnt]) break;
        memcpy(list[cnt], entry, sizeof(struct dirent));
        cnt++;
    }
    closedir(dir);

    /* 排序（按名称字典序） */
    for (size_t i = 0; i < cnt; i++) {
        for (size_t j = i + 1; j < cnt; j++) {
            if (strcmp(list[i]->d_name, list[j]->d_name) > 0) {
                struct dirent *tmp = list[i];
                list[i] = list[j];
                list[j] = tmp;
            }
        }
    }

    list[cnt] = NULL;
    *count_out = cnt;
    return list;
}

static void free_sorted_dir(struct dirent **list, size_t count)
{
    for (size_t i = 0; i < count; i++)
        free(list[i]);
    free(list);
}

/*
 * 检查某目录下是否还应继续显示条目
 * 若 flag_dirs 则只考虑子目录
 */
static size_t count_visible(const char *dirpath)
{
    size_t cnt = 0;
    DIR *dir = opendir(dirpath);
    if (!dir) return 0;

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
            continue;
        if (!flag_all && entry->d_name[0] == '.')
            continue;
        if (flag_dirs) {
            /* 需要 stat 确认类型 */
            char full[4096];
            snprintf(full, sizeof(full), "%s/%s", dirpath, entry->d_name);
            struct stat st;
            if (lstat(full, &st) != 0)
                continue;
            if (S_ISDIR(st.st_mode) || S_ISLNK(st.st_mode)) {
                /* 符号链接递归太多，简化处理：如果是链接则也计入 */
                struct stat st2;
                if (S_ISLNK(st.st_mode) && stat(full, &st2) == 0 && S_ISDIR(st2.st_mode)) {
                    cnt++;
                } else if (S_ISDIR(st.st_mode)) {
                    cnt++;
                }
            }
        } else {
            cnt++;
        }
    }
    closedir(dir);
    return cnt;
}

/*
 * 递归打印目录树
 * @prefix: 当前行前缀（不含连接线部分）
 * @dirpath: 目录路径
 * @depth:  当前递归深度（根为 0）
 */
static void tree_walk(const char *prefix, const char *dirpath, int depth)
{
    if (max_depth >= 0 && depth >= max_depth)
        return;

    size_t count;
    struct dirent **list = read_sorted_dir(dirpath, &count);
    if (!list) {
        /* 权限不足等情况 */
        fprintf(out, "%s%s [error opening dir]%s\n", prefix, C_DIR, color_reset());
        return;
    }

    size_t visible_count = 0;
    if (flag_dirs) {
        /* 只统计目录 */
        for (size_t i = 0; i < count; i++) {
            char full[4096];
            snprintf(full, sizeof(full), "%s/%s", dirpath, list[i]->d_name);
            struct stat st;
            if (lstat(full, &st) != 0) continue;
            if (S_ISDIR(st.st_mode)) {
                visible_count++;
            } else if (S_ISLNK(st.st_mode)) {
                struct stat st2;
                if (stat(full, &st2) == 0 && S_ISDIR(st2.st_mode))
                    visible_count++;
            }
        }
    } else {
        visible_count = count;
    }

    size_t idx = 0;
    for (size_t i = 0; i < count; i++) {
        bool is_last;
        const char *name = list[i]->d_name;

        if (flag_dirs) {
            char full[4096];
            snprintf(full, sizeof(full), "%s/%s", dirpath, name);
            struct stat st;
            if (lstat(full, &st) != 0) continue;
            if (S_ISDIR(st.st_mode)) {
                /* 目录 */
                is_last = (++idx == visible_count);
            } else if (S_ISLNK(st.st_mode)) {
                struct stat st2;
                if (stat(full, &st2) == 0 && S_ISDIR(st2.st_mode)) {
                    is_last = (++idx == visible_count);
                } else {
                    continue;
                }
            } else {
                continue;
            }
        } else {
            is_last = (++idx == visible_count);
        }

        /* 构建完整路径 */
        char full_path[4096];
        snprintf(full_path, sizeof(full_path), "%s/%s", dirpath, name);

        /* 获取文件信息 */
        struct stat st;
        bool is_link = false;
        bool broken  = false;
        mode_t mode  = 0;
        if (lstat(full_path, &st) == 0) {
            mode = st.st_mode;
            is_link = S_ISLNK(mode);
            if (is_link) {
                /* 链接：再尝试 stat 来统计文件类型 */
                struct stat st2;
                if (stat(full_path, &st2) == 0) {
                    mode = st2.st_mode;
                } else {
                    broken = true;
                    mode = S_IFLNK;  /* 保留链接标志 */
                }
            }
        }

        /* 决定显示名称 */
        const char *display_name = flag_full ? full_path : name;

        /* 打印连接线 */
        fprintf(out, "%s%s── %s%s%s",
                prefix,
                is_last ? "└" : "├",
                file_color(full_path, mode, is_link),
                display_name,
                color_reset());

        /* 打印类型标记 */
        print_entry_type(mode, broken);

        /* 如果是目录，递归进入 */
        if (S_ISDIR(mode) && !broken) {
            /* 深度检查在递归开始时也做一次，不过这里提前检查更高效 */
            if (max_depth < 0 || depth + 1 < max_depth) {
                fputc('/', out);
                fputc('\n', out);

                /* 构造新的前缀 */
                char new_prefix[4096];
                snprintf(new_prefix, sizeof(new_prefix), "%s%s   ",
                         prefix, is_last ? " " : "│");
                tree_walk(new_prefix, full_path, depth + 1);
                total_dirs++;
            } else {
                fputc('/', out);
                fputc('\n', out);
                total_dirs++;
            }
        } else {
            fputc('\n', out);
            if (!S_ISDIR(mode))
                total_files++;
        }
    }

    free_sorted_dir(list, count);
}

static void print_usage(const char *prog)
{
    fprintf(stderr, "用法: %s [-adf] [-L level] [-o file] [--no-color] [directory]\n", prog);
    fprintf(stderr, "选项:\n");
    fprintf(stderr, "  -a           显示所有文件\n");
    fprintf(stderr, "  -d           仅显示目录\n");
    fprintf(stderr, "  -f           显示完整路径\n");
    fprintf(stderr, "  -L level     最大显示深度\n");
    fprintf(stderr, "  -o file      输出到文件\n");
    fprintf(stderr, "  --no-color   禁用颜色输出\n");
    fprintf(stderr, "  --help       显示此帮助信息\n");
}

int main(int argc, char *argv[])
{
    setlocale(LC_ALL, "");

    out = stdout;

    /* 默认目录 */
    const char *root_dir = ".";

    /* 解析参数 */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            return 0;
        }
        if (strcmp(argv[i], "--no-color") == 0) {
            use_color = false;
            continue;
        }
        if (argv[i][0] == '-' && argv[i][1] != '\0') {
            for (int j = 1; argv[i][j] != '\0'; j++) {
                switch (argv[i][j]) {
                case 'a':
                    flag_all = true;
                    break;
                case 'd':
                    flag_dirs = true;
                    break;
                case 'f':
                    flag_full = true;
                    break;
                case 'L':
                    if (i + 1 >= argc) {
                        fprintf(stderr, "错误: -L 需要参数\n");
                        return 1;
                    }
                    max_depth = atoi(argv[++i]);
                    if (max_depth < 0) {
                        fprintf(stderr, "错误: -L 参数必须为非负数\n");
                        return 1;
                    }
                    goto next_arg;
                case 'o':
                    if (i + 1 >= argc) {
                        fprintf(stderr, "错误: -o 需要参数\n");
                        return 1;
                    }
                    out = fopen(argv[++i], "w");
                    if (!out) {
                        fprintf(stderr, "错误: 无法打开文件 '%s': %s\n",
                                argv[i], strerror(errno));
                        return 1;
                    }
                    goto next_arg;
                default:
                    fprintf(stderr, "错误: 未知选项 '%c'\n", argv[i][j]);
                    print_usage(argv[0]);
                    return 1;
                }
            }
        } else {
            root_dir = argv[i];
        }
        next_arg:;
    }

    /* 检查根目录 */
    struct stat root_st;
    if (lstat(root_dir, &root_st) != 0) {
        fprintf(stderr, "错误: 无法访问 '%s': %s\n",
                root_dir, strerror(errno));
        return 1;
    }
    if (!S_ISDIR(root_st.st_mode)) {
        fprintf(stderr, "错误: '%s' 不是目录\n", root_dir);
        return 1;
    }

    /* 打印根目录 */
    fprintf(out, "%s%s%s\n",
            use_color ? C_DIR : "",
            root_dir,
            color_reset());

    /* 递归遍历 */
    tree_walk("", root_dir, 0);

    /* 打印统计信息 */
    unsigned long total = total_dirs + total_files;
    fprintf(out, "\n%lu director%s, %lu file%s\n",
            total_dirs,
            total_dirs == 1 ? "y" : "ies",
            total_files,
            total_files == 1 ? "" : "s");

    if (out != stdout)
        fclose(out);

    return 0;
}
