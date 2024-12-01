---
title: Java新特性及函数式编程
author: Ricky
date: 2024-12-01
tags:
  - Java
---


## 背景

在当下的这个时间节点，JDK 已更新至[ 23.0.1 版本](https://www.java.com/releases/)，虽然国内的大部分传统企业还在使用 Java8 或更低的版本。但是大多数代码对 Java8 的特性使用的少之又少。

鉴于 Java 语言的 Spring 生态宣布 SpringBoot 框架将最低支持 JDK17，所以了解学习最新的 Java 变动是非常必要的。

再者出于面试的目的，多了解一些 Java 的新特性或者一些新出的技术，也能侧面反应出你对新技术的关注度。


### JDK的演变

#### Java8

JDK8是目前使用最多的一个版本，该版本于[十年前](https://zh.wikipedia.org/wiki/Java%E7%89%88%E6%9C%AC%E6%AD%B7%E5%8F%B2#Java_SE_8)即 2014 年 3 月推出，并在[ 2022 年 3 月停止商用更新](https://zh.wikipedia.org/wiki/Java%E7%89%88%E6%9C%AC%E6%AD%B7%E5%8F%B2)。

不推荐使用 Java8 的原因也很简单，Java 生态的龙头 Spring 宣布其最受欢迎的框架[ SpringBoot3.0 版本最低支持 Java17](https://spring.io/blog/2022/05/24/preparing-for-spring-boot-3-0)，且 Spring Boot 2.7 是 2.x 系列中计划的最后一个版本。已将此版本的开源支持延长 6 个月，直至 2023 年 11 月。所以如果想继续使用带有商业支持版本的 SpringBoot 框架，就必须要将对应的 Java 版本升级。

#### Java17

JDK 17 在 2021 年 9 月 14 号正式发布，且 JDK 17 是一个长期维护的版本（LTS)，商业版维护至 2027 年10 月。SpingFramework 6 和SpringBoot 3中默认将使用JDK 17，所以JDK 17必将是使用较广泛的版本; 

## 相关特性

### Java8

#### 函数式编程(lambda表达式)

Java8 的特性是面试过程中最常被问到的问题。函数式编程也是绕不开的话题。函数式编程的方式也大大简化了代码。

```java
// 常用的 lambda 写法
list.forEach(System.out::println);
lists.stream().filter(f -> f.getName().equals("p1"));
// 通过 map 获取属性集合
List<BaseQuery> list = new ArrayList<>();
List<String> collect = list.stream().map(BaseQuery::code).toList();
// count, min, max, peek...
```

#### FunctionalInterface

“函数式接口”是指仅仅只包含一个抽象方法的接口。通常在业务编程中可以用来简化实现代码。

### Java17

#### Record类型

> Records 最早在 Java 14 中作为预览特性引入，在 Java 15 中还是预览特性，在Java 16中成为正式版。

Record 类型允许在代码中使用紧凑的语法形式来声明类，而这些类能够作为不可变数据类型的封装持有者。Record 这一特性主要用在特定领域的类上；与枚举类型一样，Record 类型是一种受限形式的类型，主要用于存储、保存数据，并且没有其它额外自定义行为的场景下。

Record 类型在开发当中最常用的就是代替原有使用 `lombok` 注解的实体类，比如一个可以将 `BaseQueryClazz` 改成 `BaseQuery`，代码更简洁且不需要第三方的 `lombok`插件。

```java
@Data
public class BaseQueryClazz {
    private String name;
    private String code;
}
```

```java
public record BaseQuery(
        String name,
        String code
) {
}
```

### Java21

#### 虚拟线程

JDK21 在 9 月 19 号正式发布，带来了较多亮点，其中虚拟线程备受瞩目，毫不夸张的说，它改变了高吞吐代码的编写方式，只需要小小的变动就可以让目前的 IO 密集型程序的吞吐量得到提升，写出高吞吐量的代码不再困难。

JDK21 提供了与 Thread 完全一致的抽象 Virtual Thread 来应对这种经常阻塞的情况，阻塞仍然是会阻塞，但是换了阻塞的对象，由昂贵的平台线程阻塞改为了成本很低的虚拟线程的阻塞，当代码调用到阻塞 API 例如 IO，同步，Sleep 等操作时，JVM 会自动把 **Virtual Thread 从平台线程上卸载**，平台线程就会去处理下一个虚拟线程，通过这种方式，提升了平台线程的利用率，让平台线程不再阻塞在等待上，**从底层实现了少量平台线程就可以处理大量请求，提高了服务吞吐和 CPU 的利用率。**

##### 虚拟线程创建

**方法一：直接创建虚拟线程**

```java
Thread vt = Thread.startVirtualThread(() -> {
    System.out.println("hello wolrd virtual thread");
});
```

**方法二：创建虚拟线程但不自动运行，手动调用start()开始运行**

```java
Thread.ofVirtual().unstarted(() -> {
    System.out.println("hello wolrd virtual thread");
});
vt.start();
```

**方法三：通过虚拟线程的 ThreadFactory 创建虚拟线程**

```java
ThreadFactory tf = Thread.ofVirtual().factory();
Thread vt = tf.newThread(() -> {
    System.out.println("Start virtual thread...");
    Thread.sleep(1000);
    System.out.println("End virtual thread. ");
});
vt.start();
```

**方法四：Executors.newVirtualThreadPer** **-TaskExecutor()**

```java
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
executor.submit(() -> {
    System.out.println("Start virtual thread...");
    Thread.sleep(1000);
    System.out.println("End virtual thread.");
    return true;
});
```

关于更多虚拟线程的信息可参考得物技术的[虚拟线程原理及性能分析](https://tech.dewu.com/article?id=89)

## 相关引用材料

- [Java release](https://www.java.com/releases/)
- [Oracle 官网的 JDK 版本](https://www.oracle.com/java/technologies/downloads/)
- [Preparing for Spring Boot 3.0](https://spring.io/blog/2022/05/24/preparing-for-spring-boot-3-0)
- [Java 8 - 函数编程(lambda表达式)](https://pdai.tech/md/java/java8/java8-stream.html)
- [虚拟线程原理及性能分析](https://tech.dewu.com/article?id=89)
